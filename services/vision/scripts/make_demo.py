#!/usr/bin/env python3
"""Build a synthetic restaurant demo video and zones.json from the live app config.

Run inside the vision image (it needs YOLO and OpenCV):

    docker compose run --rm vision python scripts/make_demo.py

The script pulls the real table IDs and polygons from /api/vision/config, crops
people from Ultralytics' bus.jpg, composites them onto a synthetic floor, and
writes one video per camera plus /data/zones.json.
"""

from __future__ import annotations

import argparse
import json
import os
from copy import deepcopy
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import requests

from app.detector import Detector

BUS_URL = "https://ultralytics.com/images/bus.jpg"


def fetch_config(api_base: str, secret: str) -> dict[str, Any]:
    response = requests.get(
        f"{api_base.rstrip('/')}/api/vision/config",
        headers={"Authorization": f"Bearer {secret}"},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()


def load_people(image: np.ndarray, detector: Detector, limit: int = 4) -> list[np.ndarray]:
    height, width = image.shape[:2]
    people: list[np.ndarray] = []
    for box in sorted(detector.detect(image), key=lambda b: (b.x2 - b.x1) * (b.y2 - b.y1), reverse=True):
        x1 = max(0, int(box.x1) - 4)
        y1 = max(0, int(box.y1) - 4)
        x2 = min(width, int(box.x2) + 4)
        y2 = min(height, int(box.y2) + 4)
        if x2 - x1 < 12 or y2 - y1 < 30:
            continue
        people.append(image[y1:y2, x1:x2].copy())
        if len(people) >= limit:
            break
    if not people:
        raise SystemExit("No people detected in the source image; pass a clearer --image")
    return people


def polygon_bounds(table: dict[str, Any], width: int, height: int) -> tuple[float, float, float, float]:
    xs = [float(point[0]) * width for point in table["polygon"]]
    ys = [float(point[1]) * height for point in table["polygon"]]
    return min(xs), min(ys), max(xs), max(ys)


def background(width: int, height: int, tables: list[dict[str, Any]]) -> np.ndarray:
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    for y in range(height):
        shade = 20 + int(22 * y / max(1, height))
        frame[y, :] = (shade + 4, shade, shade + 8)

    for table in tables:
        points = np.array(
            [[int(float(x) * width), int(float(y) * height)] for x, y in table["polygon"]],
            dtype=np.int32,
        )
        cv2.fillPoly(frame, [points], (44, 42, 40))
        cv2.polylines(frame, [points], True, (86, 84, 80), 2)
        center = points.mean(axis=0).astype(int)
        cv2.putText(
            frame,
            str(table.get("label", "?")),
            (max(4, int(center[0]) - 16), max(18, int(center[1]))),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (180, 180, 180),
            2,
            cv2.LINE_AA,
        )

    cv2.putText(
        frame,
        "DineSense demo camera",
        (12, height - 14),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (120, 120, 120),
        1,
        cv2.LINE_AA,
    )
    return frame


def paste_person(frame: np.ndarray, person: np.ndarray, center_x: float, bottom_y: float, height: float) -> None:
    frame_height, frame_width = frame.shape[:2]
    scale = height / person.shape[0]
    person_height = max(1, int(person.shape[0] * scale))
    person_width = max(1, int(person.shape[1] * scale))
    resized = cv2.resize(person, (person_width, person_height), interpolation=cv2.INTER_AREA)
    x = int(center_x - person_width / 2)
    y = int(bottom_y - person_height)
    x = max(0, min(frame_width - person_width, x))
    y = max(0, min(frame_height - person_height, y))
    frame[y : y + person_height, x : x + person_width] = resized


def actors_for(tables: list[dict[str, Any]], duration: float) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    if not tables:
        return [], None
    sitter = min(2, len(tables) - 1)
    second = 0 if sitter != 0 else min(1, len(tables) - 1)
    walker = 1 if len(tables) > 1 else None
    actors = [{"table": tables[sitter], "person": 0, "start": 8.0, "end": duration - 12.0}]
    if len(tables) > 2 and second != sitter:
        actors.append({"table": tables[second], "person": 1, "start": 30.0, "end": duration - 12.0})
    crossing = None
    if walker is not None and walker not in (sitter, second):
        crossing = {"table": tables[walker], "person": 0, "start": 18.0, "end": 22.0}
    return actors, crossing


def build_video(
    path: Path,
    tables: list[dict[str, Any]],
    people: list[np.ndarray],
    width: int,
    height: int,
    fps: int,
    duration: float,
    person_height: float,
) -> None:
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise SystemExit(f"Could not open video writer for {path}")

    actors, walker = actors_for(tables, duration)
    total_frames = int(duration * fps)
    base = background(width, height, tables)
    try:
        for index in range(total_frames):
            moment = index / fps
            frame = base.copy()
            for actor in actors:
                if actor["start"] <= moment <= actor["end"]:
                    min_x, _min_y, max_x, max_y = polygon_bounds(actor["table"], width, height)
                    paste_person(
                        frame,
                        people[actor["person"] % len(people)],
                        center_x=(min_x + max_x) / 2,
                        bottom_y=max_y - 0.03 * height,
                        height=person_height * height,
                    )
            if walker and walker["start"] <= moment <= walker["end"]:
                min_x, _min_y, max_x, max_y = polygon_bounds(walker["table"], width, height)
                progress = (moment - walker["start"]) / max(0.001, walker["end"] - walker["start"])
                center_x = (min_x - 0.06 * width) + progress * (max_x - min_x + 0.12 * width)
                paste_person(
                    frame,
                    people[walker["person"] % len(people)],
                    center_x=center_x,
                    bottom_y=max_y - 0.03 * height,
                    height=person_height * height,
                )
            writer.write(frame)
    finally:
        writer.release()


def verify_video(path: Path, detector: Detector, fps: int, moment: float = 30.0) -> int:
    capture = cv2.VideoCapture(str(path))
    capture.set(cv2.CAP_PROP_POS_FRAMES, int(moment * fps))
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise SystemExit(f"Could not read a frame from {path}")
    return len(detector.detect(frame))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate DineSense demo videos")
    parser.add_argument("--api-base", default=os.environ.get("API_BASE_URL", "http://web:3000"))
    parser.add_argument("--secret", default=os.environ.get("VISION_SHARED_SECRET", ""))
    parser.add_argument("--out", default=os.environ.get("DEMO_DIR", "/data"))
    parser.add_argument("--image", default="")
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--height", type=int, default=540)
    parser.add_argument("--fps", type=int, default=20)
    parser.add_argument("--duration", type=float, default=80.0)
    parser.add_argument("--person-height", type=float, default=0.4)
    parser.add_argument("--seated-confirm", type=float, default=5.0)
    parser.add_argument("--empty-confirm", type=float, default=5.0)
    args = parser.parse_args()

    if not args.secret:
        raise SystemExit("VISION_SHARED_SECRET (or --secret) is required")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Fetching camera/table config from {args.api_base} ...")
    payload = fetch_config(args.api_base, args.secret)
    cameras = payload.get("cameras") or []
    if not cameras:
        raise SystemExit("The API returned no cameras. Seed the app first.")

    image_path = Path(args.image) if args.image else out_dir / "bus.jpg"
    if not image_path.exists():
        print(f"Downloading {BUS_URL} ...")
        response = requests.get(BUS_URL, timeout=30)
        response.raise_for_status()
        image_path.write_bytes(response.content)
    image = cv2.imread(str(image_path))
    if image is None:
        raise SystemExit(f"Could not read {image_path}")

    detector = Detector(
        model_path=os.environ.get("YOLO_MODEL", "/app/models/yolox_nano.onnx"),
        conf=float(os.environ.get("YOLO_CONF", "0.35")),
        imgsz=int(os.environ.get("YOLO_IMGSZ", "416")),
        device=os.environ.get("YOLO_DEVICE", "cpu"),
    )
    people = load_people(image, detector)
    print(f"Using {len(people)} person crops from {image_path}")

    demo = {
        "settings": {
            "SEATED_CONFIRM_S": args.seated_confirm,
            "EMPTY_CONFIRM_S": args.empty_confirm,
        },
        "cameras": [],
    }

    for index, camera in enumerate(cameras):
        video_path = out_dir / f"camera_{index + 1}.mp4"
        tables = sorted(camera.get("tables") or [], key=lambda table: table.get("label", ""))
        if not tables:
            print(f"Skipping {camera.get('name')} (no tables)")
            continue
        build_video(
            video_path,
            tables,
            people,
            width=args.width,
            height=args.height,
            fps=args.fps,
            duration=args.duration,
            person_height=args.person_height,
        )
        detected = verify_video(video_path, detector, args.fps)
        print(f"  {video_path.name}: {len(tables)} tables, {detected} people detected at 30s")
        if detected == 0:
            raise SystemExit(
                "The generated video has no detectable people. Re-run with "
                "--person-height 0.5 or a clearer --image."
            )
        entry = deepcopy(camera)
        entry["video"] = f"/data/{video_path.name}"
        demo["cameras"].append(entry)

    zones_path = out_dir / "zones.json"
    zones_path.write_text(json.dumps(demo, indent=2), encoding="utf-8")
    print(f"\nWrote {zones_path} and {len(demo['cameras'])} video(s) in {out_dir}")
    print("Start the demo with:")
    print("  VISION_DEMO=true docker compose up -d vision")
    print("Then open the dev console and reset all tables to free.")


if __name__ == "__main__":
    main()
