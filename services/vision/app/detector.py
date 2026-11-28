from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import numpy as np

from .models import PersonBox

EXPECTED_MODEL_SHA256 = "c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d"
DEFAULT_MODEL_PATH = "/app/models/yolox_nano.onnx"


def _nms(boxes: np.ndarray, scores: np.ndarray, threshold: float) -> list[int]:
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        current = int(order[0])
        keep.append(current)
        if order.size == 1:
            break
        rest = order[1:]
        xx1 = np.maximum(x1[current], x1[rest])
        yy1 = np.maximum(y1[current], y1[rest])
        xx2 = np.minimum(x2[current], x2[rest])
        yy2 = np.minimum(y2[current], y2[rest])
        width = np.maximum(0, xx2 - xx1)
        height = np.maximum(0, yy2 - yy1)
        overlap = (width * height) / np.maximum(areas[current] + areas[rest] - width * height, 1e-6)
        order = rest[overlap <= threshold]
    return keep


def decode_yolox_output(
    output: Any,
    conf: float,
    input_size: int,
    original_shape: tuple[int, int, int],
    scale: float,
    pad: tuple[float, float],
) -> list[PersonBox]:
    predictions = np.asarray(output)
    if predictions.ndim == 3:
        predictions = predictions[0]
    if predictions.ndim != 2 or predictions.shape[1] < 6:
        return []

    pad_x, pad_y = pad
    boxes: list[list[float]] = []
    scores: list[float] = []
    for row in predictions:
        objectness = float(row[4])
        person_probability = float(row[5])
        score = objectness * person_probability
        if score < conf:
            continue
        cx, cy, width, height = (float(value) for value in row[:4])
        boxes.append(
            [
                (cx - width / 2 - pad_x) / scale,
                (cy - height / 2 - pad_y) / scale,
                (cx + width / 2 - pad_x) / scale,
                (cy + height / 2 - pad_y) / scale,
            ]
        )
        scores.append(score)

    if not boxes:
        return []
    array = np.asarray(boxes, dtype=np.float32)
    score_array = np.asarray(scores, dtype=np.float32)
    height, width = original_shape[:2]
    array[:, [0, 2]] = np.clip(array[:, [0, 2]], 0, width)
    array[:, [1, 3]] = np.clip(array[:, [1, 3]], 0, height)
    keep = _nms(array, score_array, 0.45)
    return [
        PersonBox(
            x1=float(array[index][0]),
            y1=float(array[index][1]),
            x2=float(array[index][2]),
            y2=float(array[index][3]),
            confidence=float(score_array[index]),
        )
        for index in keep
    ]


class Detector:
    def __init__(
        self,
        model_path: str = DEFAULT_MODEL_PATH,
        conf: float = 0.35,
        imgsz: int = 416,
        device: str = "cpu",
    ) -> None:
        digest = hashlib.sha256(Path(model_path).read_bytes()).hexdigest()
        if digest != EXPECTED_MODEL_SHA256:
            raise RuntimeError("YOLOX model checksum mismatch")
        import onnxruntime as ort

        self.session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name
        self.conf = conf
        self.imgsz = imgsz
        self.device = device

    def _preprocess(self, frame: np.ndarray) -> tuple[np.ndarray, float, tuple[float, float]]:
        import cv2

        height, width = frame.shape[:2]
        scale = min(self.imgsz / width, self.imgsz / height)
        resized = cv2.resize(frame, (int(width * scale), int(height * scale)))
        pad_x = (self.imgsz - resized.shape[1]) / 2
        pad_y = (self.imgsz - resized.shape[0]) / 2
        canvas = np.full((self.imgsz, self.imgsz, 3), 114, dtype=np.uint8)
        x_offset, y_offset = int(pad_x), int(pad_y)
        canvas[y_offset : y_offset + resized.shape[0], x_offset : x_offset + resized.shape[1]] = resized
        blob = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 255.0
        return blob, scale, (pad_x, pad_y)

    def detect(self, frame: np.ndarray) -> list[PersonBox]:
        blob, scale, pad = self._preprocess(frame)
        output = self.session.run([self.output_name], {self.input_name: blob})[0]
        return decode_yolox_output(output, self.conf, self.imgsz, frame.shape, scale, pad)

    def track(self, frame: np.ndarray) -> list[PersonBox]:
        return self.detect(frame)
