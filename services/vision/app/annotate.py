from __future__ import annotations

from typing import Mapping

import cv2
import numpy as np

from .models import CameraSpec, TableState

COLORS = {
    "empty": (90, 200, 130),
    "occupied": (70, 70, 235),
    "muted": (160, 160, 160),
}


def annotate_frame(
    frame: np.ndarray,
    camera: CameraSpec,
    states: Mapping[str, TableState],
    counts: Mapping[str, int],
    fps: float,
    status: str,
    muted: set[str],
) -> np.ndarray:
    height, width = frame.shape[:2]
    for table in camera.tables:
        points = np.array(
            [[int(x * width), int(y * height)] for x, y in table.polygon],
            dtype=np.int32,
        )
        key = "muted" if table.id in muted else states.get(table.id, "empty")
        color = COLORS[key]
        cv2.polylines(frame, [points], isClosed=True, color=color, thickness=2)
        center_x = int(points[:, 0].mean())
        center_y = int(points[:, 1].mean())
        label = f"{table.label} {counts.get(table.id, 0)}"
        cv2.putText(
            frame,
            label,
            (max(4, center_x - 30), max(18, center_y)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
            cv2.LINE_AA,
        )

    cv2.rectangle(frame, (0, 0), (width, 34), (15, 23, 42), -1)
    header = f"{camera.name} | {fps:4.1f} fps | {status}"
    cv2.putText(
        frame,
        header,
        (10, 24),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (240, 240, 240),
        1,
        cv2.LINE_AA,
    )
    return frame
