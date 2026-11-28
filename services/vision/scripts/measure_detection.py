from __future__ import annotations

import argparse
import time

import cv2

from app.detector import Detector


def main() -> None:
    parser = argparse.ArgumentParser(description="Measure person detections on a recorded video")
    parser.add_argument("video", help="path to a local video file")
    parser.add_argument("--model", default="/app/models/yolox_nano.onnx")
    parser.add_argument("--conf", type=float, default=0.35)
    args = parser.parse_args()

    detector = Detector(model_path=args.model, conf=args.conf)
    capture = cv2.VideoCapture(args.video)
    if not capture.isOpened():
        raise SystemExit(f"Could not open {args.video}")

    frames = 0
    total_boxes = 0
    started = time.monotonic()
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        boxes = detector.detect(frame)
        frames += 1
        total_boxes += len(boxes)
    capture.release()
    elapsed = max(time.monotonic() - started, 0.001)
    print(f"frames={frames} person_boxes={total_boxes} seconds={elapsed:.2f} fps={frames / elapsed:.2f}")


if __name__ == "__main__":
    main()
