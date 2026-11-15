from __future__ import annotations

import logging
import queue
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable

import requests

logger = logging.getLogger("dinesense.vision")


class PermanentPostError(RuntimeError):
    pass


class VisionApi:
    def __init__(self, base_url: str, secret: str, timeout: float = 5.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.timeout = timeout
        self._session = requests.Session()

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.secret}"}

    def get_config(self) -> dict[str, Any]:
        response = self._session.get(
            f"{self.base_url}/api/vision/config",
            headers=self._headers(),
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def post_event(self, event: dict[str, Any]) -> None:
        response = self._session.post(
            f"{self.base_url}/api/vision/events",
            headers={**self._headers(), "Content-Type": "application/json"},
            json=event,
            timeout=self.timeout,
        )
        if 400 <= response.status_code < 500 and response.status_code not in (408, 425, 429):
            raise PermanentPostError(
                f"event rejected ({response.status_code}): {response.text[:200]}"
            )
        response.raise_for_status()

    def post_heartbeat(self, camera_id: str, status: str, fps: float) -> None:
        payload = {
            "camera_id": camera_id,
            "status": status,
            "fps": round(float(fps), 2),
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        response = self._session.post(
            f"{self.base_url}/api/vision/heartbeat",
            headers={**self._headers(), "Content-Type": "application/json"},
            json=payload,
            timeout=self.timeout,
        )
        if response.status_code >= 500:
            raise RuntimeError(f"heartbeat failed ({response.status_code})")
        if response.status_code == 404:
            raise PermanentPostError("camera not found")


class EventSender:
    def __init__(
        self,
        post: Callable[[dict[str, Any]], None],
        queue_size: int = 500,
        retry_base_s: float = 1.0,
        max_delay_s: float = 30.0,
    ) -> None:
        self._post = post
        self._queue: queue.Queue[dict[str, Any] | None] = queue.Queue(maxsize=queue_size)
        self._retry_base_s = retry_base_s
        self._max_delay_s = max_delay_s
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="event-sender", daemon=True)
        self.sent = 0
        self.dropped = 0
        self.failed_attempts = 0

    def start(self) -> None:
        self._thread.start()

    def submit(self, event: dict[str, Any]) -> None:
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            self.dropped += 1
            try:
                self._queue.get_nowait()
                self._queue.put_nowait(event)
            except (queue.Empty, queue.Full):
                pass

    def stats(self) -> dict[str, int]:
        return {
            "queued": self._queue.qsize(),
            "sent": self.sent,
            "dropped": self.dropped,
            "failed_attempts": self.failed_attempts,
        }

    def stop(self) -> None:
        self._stop.set()
        try:
            self._queue.put_nowait(None)
        except queue.Full:
            pass
        self._thread.join(timeout=2.0)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                event = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue
            if event is None:
                return
            self._deliver(event)

    def _deliver(self, event: dict[str, Any]) -> None:
        attempt = 0
        while not self._stop.is_set():
            try:
                self._post(event)
                self.sent += 1
                return
            except PermanentPostError as error:
                logger.warning("dropping event: %s", error)
                self.dropped += 1
                return
            except Exception as error:  # noqa: BLE001 - network failures must be retried
                self.failed_attempts += 1
                attempt += 1
                delay = min(self._max_delay_s, self._retry_base_s * (2 ** min(attempt, 5)))
                logger.warning(
                    "event post failed (%s), retrying in %.1fs", error, delay
                )
                if self._stop.wait(delay):
                    return


class HeartbeatPublisher:
    def __init__(
        self,
        send: Callable[[str, str, float], None],
        interval_s: float = 10.0,
    ) -> None:
        self._send = send
        self._interval_s = max(0.05, interval_s)
        self._lock = threading.Lock()
        self._statuses: dict[str, tuple[str, float]] = {}
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="heartbeat", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def update(self, camera_id: str, status: str, fps: float) -> None:
        with self._lock:
            self._statuses[camera_id] = (status, fps)

    def remove(self, camera_id: str) -> None:
        with self._lock:
            self._statuses.pop(camera_id, None)

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2.0)

    def _run(self) -> None:
        while not self._stop.is_set():
            with self._lock:
                statuses = list(self._statuses.items())
            for camera_id, (status, fps) in statuses:
                try:
                    self._send(camera_id, status, fps)
                except PermanentPostError as error:
                    logger.warning("heartbeat dropped for %s: %s", camera_id, error)
                except Exception as error:  # noqa: BLE001 - heartbeats are best effort
                    logger.warning("heartbeat failed for %s: %s", camera_id, error)
            if self._stop.wait(self._interval_s):
                return


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def monotonic() -> float:
    return time.monotonic()
