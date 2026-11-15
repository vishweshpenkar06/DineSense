from __future__ import annotations

import csv
import os
import threading
from typing import Any


class TuningLogger:
    HEADER = [
        "ts",
        "camera_id",
        "camera_name",
        "table_id",
        "table_label",
        "person_count",
        "debounced_state",
        "muted",
        "target_fps",
        "measured_fps",
    ]

    def __init__(self, path: str) -> None:
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        new_file = not os.path.exists(path) or os.path.getsize(path) == 0
        self._handle = open(path, "a", newline="", encoding="utf-8")
        self._writer = csv.writer(self._handle)
        self._lock = threading.Lock()
        if new_file:
            self._writer.writerow(self.HEADER)
            self._handle.flush()

    def log(self, row: dict[str, Any]) -> None:
        with self._lock:
            self._writer.writerow([row.get(column, "") for column in self.HEADER])
            self._handle.flush()

    def close(self) -> None:
        with self._lock:
            self._handle.close()


class SnapshotStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._frames: dict[str, dict[str, tuple[bytes, float]]] = {}

    def put(
        self,
        camera_id: str,
        jpeg: bytes,
        taken_at: float,
        kind: str = "annotated",
    ) -> None:
        with self._lock:
            self._frames.setdefault(camera_id, {})[kind] = (jpeg, taken_at)

    def get(self, camera_id: str, kind: str = "annotated") -> tuple[bytes, float] | None:
        with self._lock:
            return self._frames.get(camera_id, {}).get(kind)
