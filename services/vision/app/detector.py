from __future__ import annotations

from typing import Any

import numpy as np

from .models import PersonBox


class Detector:
    def __init__(
        self,
        model_path: str = "yolo11n.pt",
        conf: float = 0.35,
        imgsz: int = 640,
        device: str = "cpu",
    ) -> None:
        from ultralytics import YOLO

        self.model = YOLO(model_path)
        self.conf = conf
        self.imgsz = imgsz
        self.device = device

    def _boxes(self, results: Any) -> list[PersonBox]:
        if not results:
            return []
        boxes = getattr(results[0], "boxes", None)
        if boxes is None or getattr(boxes, "xyxy", None) is None:
            return []
        try:
            xyxy = boxes.xyxy.cpu().numpy()
            confs = boxes.conf.cpu().numpy()
        except AttributeError:
            xyxy = np.asarray(boxes.xyxy)
            confs = np.asarray(boxes.conf)
        people: list[PersonBox] = []
        for index in range(len(xyxy)):
            x1, y1, x2, y2 = (float(value) for value in xyxy[index][:4])
            people.append(
                PersonBox(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    confidence=float(confs[index]) if index < len(confs) else 0.0,
                )
            )
        return people

    def track(self, frame: np.ndarray) -> list[PersonBox]:
        results = self.model.track(
            source=frame,
            persist=True,
            classes=[0],
            conf=self.conf,
            imgsz=self.imgsz,
            device=self.device,
            verbose=False,
            tracker="bytetrack.yaml",
        )
        return self._boxes(results)

    def detect(self, frame: np.ndarray) -> list[PersonBox]:
        results = self.model.predict(
            source=frame,
            classes=[0],
            conf=self.conf,
            imgsz=self.imgsz,
            device=self.device,
            verbose=False,
        )
        return self._boxes(results)
