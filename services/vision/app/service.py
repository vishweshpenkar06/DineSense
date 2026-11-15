from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any

from .client import EventSender, HeartbeatPublisher, VisionApi
from .config import (
    ConfigError,
    ConfigStore,
    Environment,
    load_zones_file,
    parse_vision_config,
)
from .models import VisionSettings
from .runner import CameraRunner
from .store import SnapshotStore, TuningLogger

logger = logging.getLogger("dinesense.vision")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class VisionService:
    def __init__(self, env: Environment) -> None:
        self.env = env
        self.store = ConfigStore()
        self.api = VisionApi(env.api_base_url, env.shared_secret)
        self.sender = EventSender(self.api.post_event)
        self.heartbeats = HeartbeatPublisher(self.api.post_heartbeat, interval_s=10.0)
        self.snapshots = SnapshotStore()
        self.tuning = TuningLogger(env.tuning_log_path)
        self.runners: dict[str, CameraRunner] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._config_thread: threading.Thread | None = None
        self.config_source = "none"
        self.config_error: str | None = None
        self.last_config_at: str | None = None
        self.started_at = _iso_now()

    def start(self) -> None:
        self.sender.start()
        self.heartbeats.start()
        self._load_config(initial=True)
        self._reconcile()
        self._config_thread = threading.Thread(
            target=self._config_loop, name="config-poll", daemon=True
        )
        self._config_thread.start()

    def _config_loop(self) -> None:
        while not self._stop.is_set():
            interval = max(5.0, self.store.settings().config_poll_s)
            if self._stop.wait(interval):
                return
            self._load_config(initial=False)
            self._reconcile()

    def _load_config(self, initial: bool) -> None:
        if self.env.demo or self.env.force_file:
            self._load_from_file()
            return

        try:
            payload = self.api.get_config()
        except Exception as error:  # noqa: BLE001 - the vision service must survive web downtime
            self.config_error = str(error)
            logger.warning("could not fetch config: %s", error)
            if initial or not self.store.snapshot()[0]:
                if os.path.exists(self.env.zones_file):
                    logger.info("falling back to %s", self.env.zones_file)
                    self._load_from_file()
            return

        try:
            cameras, base = parse_vision_config(payload, VisionSettings())
        except ConfigError as error:
            self.config_error = f"invalid config: {error}"
            logger.error("invalid config: %s", error)
            return

        self.store.set(cameras, base)
        self.config_source = "api"
        self.config_error = None
        self.last_config_at = _iso_now()
        logger.info("loaded %d cameras from the web API", len(cameras))

    def _load_from_file(self) -> None:
        try:
            payload = load_zones_file(self.env.zones_file)
            cameras, base = parse_vision_config(payload, VisionSettings())
        except Exception as error:  # noqa: BLE001 - retried by the config loop
            self.config_error = f"zones file: {error}"
            logger.error("could not load %s: %s", self.env.zones_file, error)
            return

        self.store.set(cameras, base)
        self.config_source = f"file:{self.env.zones_file}"
        self.config_error = None
        self.last_config_at = _iso_now()
        logger.info("loaded %d cameras from %s", len(cameras), self.env.zones_file)

    def _reconcile(self) -> None:
        cameras, settings = self.store.snapshot()
        desired = {camera.id: camera for camera in cameras}
        with self._lock:
            for camera_id in list(self.runners):
                if camera_id not in desired:
                    runner = self.runners.pop(camera_id)
                    runner.stop()
                    runner.join(timeout=2.0)
                    self.heartbeats.remove(camera_id)

            for camera in cameras:
                signature = (
                    camera.signature(),
                    settings.seated_confirm_s,
                    settings.empty_confirm_s,
                    settings.gap_tolerance_s,
                )
                runner = self.runners.get(camera.id)
                if runner is not None and runner.is_alive() and runner.signature == signature:
                    continue
                if runner is not None:
                    runner.stop()
                    runner.join(timeout=2.0)
                    self.heartbeats.remove(camera.id)
                fresh = CameraRunner(
                    camera=camera,
                    store=self.store,
                    env=self.env,
                    sender=self.sender,
                    heartbeats=self.heartbeats,
                    snapshots=self.snapshots,
                    tuning=self.tuning,
                    signature=signature,
                )
                fresh.start()
                self.runners[camera.id] = fresh

    def snapshot(self, camera_id: str) -> tuple[bytes, float] | None:
        return self.snapshots.get(camera_id)

    def health(self) -> dict[str, Any]:
        cameras, _settings = self.store.snapshot()
        with self._lock:
            runners = dict(self.runners)
        rows: list[dict[str, Any]] = []
        for camera in cameras:
            runner = runners.get(camera.id)
            stats = runner.stats() if runner else {"status": "offline", "fps": 0.0, "target_fps": 0.0}
            frame = self.snapshots.get(camera.id)
            rows.append(
                {
                    "camera_id": camera.id,
                    "name": camera.name,
                    "status": stats.get("status", "offline"),
                    "fps": stats.get("fps", 0.0),
                    "target_fps": stats.get("target_fps", 0.0),
                    "last_frame_at": stats.get("last_frame_at"),
                    "snapshot_age_s": round(datetime.now().timestamp() - frame[1], 2) if frame else None,
                    "tables": len(camera.tables),
                    "input": "video" if camera.video_path else "rtsp",
                }
            )
        ok = bool(rows) and all(row["status"] != "offline" for row in rows)
        return {
            "ok": ok,
            "started_at": self.started_at,
            "config": {
                "source": self.config_source,
                "error": self.config_error,
                "last_at": self.last_config_at,
            },
            "queue": self.sender.stats(),
            "cameras": rows,
        }

    def stop(self) -> None:
        self._stop.set()
        if self._config_thread is not None:
            self._config_thread.join(timeout=2.0)
        with self._lock:
            for runner in self.runners.values():
                runner.stop()
            for camera_id, runner in self.runners.items():
                runner.join(timeout=3.0)
                self.heartbeats.remove(camera_id)
            self.runners.clear()
        self.heartbeats.stop()
        self.sender.stop()
        self.tuning.close()
        self.api._session.close()
