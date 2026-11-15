from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any

import cv2

from .annotate import annotate_frame
from .client import EventSender, HeartbeatPublisher, iso_now
from .config import ConfigStore, Environment
from .debounce import TableDebouncer
from .detector import Detector
from .fps import FpsGovernor
from .geometry import count_in_polygon
from .models import CameraSpec, TableState
from .store import SnapshotStore, TuningLogger

logger = logging.getLogger("dinesense.vision")


class CameraRunner(threading.Thread):
    def __init__(
        self,
        camera: CameraSpec,
        store: ConfigStore,
        env: Environment,
        sender: EventSender,
        heartbeats: HeartbeatPublisher,
        snapshots: SnapshotStore,
        tuning: TuningLogger,
        signature: tuple[Any, ...],
    ) -> None:
        super().__init__(name=f"camera-{camera.name}", daemon=True)
        self.camera_id = camera.id
        self.signature = signature
        self._store = store
        self._env = env
        self._sender = sender
        self._heartbeats = heartbeats
        self._snapshots = snapshots
        self._tuning = tuning
        self._stop_event = threading.Event()
        self._stats_lock = threading.Lock()
        self._stats: dict[str, Any] = {
            "status": "offline",
            "fps": 0.0,
            "target_fps": 3.0,
            "last_frame_at": None,
        }

    def stop(self) -> None:
        self._stop_event.set()

    def stats(self) -> dict[str, Any]:
        with self._stats_lock:
            return dict(self._stats)

    def run(self) -> None:
        try:
            self._loop()
        except Exception:  # noqa: BLE001 - a camera thread must never kill the service
            logger.exception("camera runner crashed")
        finally:
            self._heartbeats.update(self.camera_id, "offline", 0.0)
            self._set_stats("offline", 0.0, 3.0)

    def _set_stats(self, status: str, fps: float, target_fps: float) -> None:
        with self._stats_lock:
            self._stats = {
                "status": status,
                "fps": round(float(fps), 2),
                "target_fps": round(float(target_fps), 2),
                "last_frame_at": (
                    datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                    if status != "offline"
                    else self._stats.get("last_frame_at")
                ),
            }

    def _loop(self) -> None:
        backoff = 1.0
        while not self._stop_event.is_set():
            camera = self._store.camera(self.camera_id)
            if camera is None:
                return
            source = camera.video_path or camera.rtsp_url
            if not source:
                logger.warning("camera %s has no input configured", camera.name)
                self._heartbeats.update(self.camera_id, "offline", 0.0)
                self._set_stats("offline", 0.0, 3.0)
                self._stop_event.wait(5.0)
                continue

            capture = cv2.VideoCapture(source)
            if not capture.isOpened():
                logger.warning(
                    "cannot open %s for camera %s",
                    "video" if camera.video_path else "RTSP stream",
                    camera.name,
                )
                capture.release()
                self._heartbeats.update(self.camera_id, "offline", 0.0)
                self._set_stats("offline", 0.0, 3.0)
                self._stop_event.wait(backoff)
                backoff = min(30.0, backoff * 2)
                continue

            backoff = 1.0
            logger.info("camera %s connected", camera.name)
            try:
                detector = Detector(
                    model_path=self._env.model_path,
                    conf=self._env.model_conf,
                    imgsz=self._env.model_imgsz,
                    device=self._env.device,
                )
                self._process(capture, camera, detector)
            finally:
                capture.release()

    def _process(
        self,
        capture: cv2.VideoCapture,
        camera: CameraSpec,
        detector: Detector,
    ) -> None:
        is_video = bool(camera.video_path)
        source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        if source_fps <= 0 or source_fps > 120:
            source_fps = 25.0 if is_video else 0.0
        read_interval = 1.0 / source_fps if is_video and source_fps > 0 else 0.0

        settings = self._store.settings()
        governor = FpsGovernor(target_fps=min(3.0, settings.target_fps), min_fps=settings.min_fps)
        snapshot_interval = 1.0 / max(0.2, self._env.snapshot_fps)

        debouncers: dict[str, TableDebouncer] = {}
        last_sent: dict[str, TableState] = {}
        states: dict[str, TableState] = {}
        counts: dict[str, int] = {}
        detect_times: deque[float] = deque(maxlen=30)

        next_detect = time.monotonic()
        next_snapshot = 0.0
        last_read = time.monotonic()

        while not self._stop_event.is_set():
            current = self._store.camera(self.camera_id)
            if current is None:
                return

            ok, frame = capture.read()
            if not ok:
                if is_video:
                    capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    last_read = time.monotonic()
                    continue
                logger.warning("stream ended for %s", camera.name)
                return

            if is_video and read_interval > 0:
                delay = read_interval - (time.monotonic() - last_read)
                if delay > 0:
                    time.sleep(delay)
                last_read = time.monotonic()

            if time.monotonic() < next_detect:
                continue

            started = time.monotonic()
            boxes = detector.track(frame)
            now_dt = datetime.now(timezone.utc)
            muted_ids = {table.id for table in current.tables if table.is_muted(now_dt)}
            live_settings = self._store.settings()

            for table in current.tables:
                count, confidence = count_in_polygon(
                    boxes, table.polygon, frame.shape[1], frame.shape[0]
                )
                debouncer = debouncers.get(table.id)
                if debouncer is None:
                    debouncer = TableDebouncer(
                        seated_confirm_s=live_settings.seated_confirm_s,
                        empty_confirm_s=live_settings.empty_confirm_s,
                        gap_tolerance_s=live_settings.gap_tolerance_s,
                    )
                    debouncers[table.id] = debouncer
                state = debouncer.update(count, started)
                states[table.id] = state
                counts[table.id] = count

                if table.id in muted_ids:
                    continue
                if last_sent.get(table.id) == state:
                    continue
                self._sender.submit(
                    {
                        "camera_id": self.camera_id,
                        "table_id": table.id,
                        "state": state,
                        "person_count": count,
                        "confidence": round(confidence, 3),
                        "ts": iso_now(),
                        "event_id": str(uuid.uuid4()),
                    }
                )
                last_sent[table.id] = state

            processing_s = time.monotonic() - started
            governor.observe(processing_s)
            target_fps = min(3.0, governor.target_fps)
            now = time.monotonic()
            next_detect = now + 1.0 / max(target_fps, 0.2)
            status = "degraded" if target_fps < 3.0 else "ok"

            detect_times.append(now)
            while detect_times and now - detect_times[0] > 3.0:
                detect_times.popleft()
            if len(detect_times) >= 2:
                span = detect_times[-1] - detect_times[0]
                measured_fps = (len(detect_times) - 1) / span if span > 0 else 0.0
            else:
                measured_fps = 0.0

            self._heartbeats.update(self.camera_id, status, measured_fps or target_fps)
            self._set_stats(status, measured_fps or target_fps, target_fps)

            if now >= next_snapshot:
                annotated = annotate_frame(
                    frame.copy(),
                    current,
                    states,
                    counts,
                    measured_fps or target_fps,
                    status,
                    muted_ids,
                )
                encoded, buffer = cv2.imencode(
                    ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80]
                )
                if encoded:
                    self._snapshots.put(self.camera_id, buffer.tobytes(), time.time())
                for table in current.tables:
                    self._tuning.log(
                        {
                            "ts": iso_now(),
                            "camera_id": camera.id,
                            "camera_name": camera.name,
                            "table_id": table.id,
                            "table_label": table.label,
                            "person_count": counts.get(table.id, 0),
                            "debounced_state": states.get(table.id, "empty"),
                            "muted": table.id in muted_ids,
                            "target_fps": round(target_fps, 2),
                            "measured_fps": round(measured_fps or target_fps, 2),
                        }
                    )
                next_snapshot = now + snapshot_interval
