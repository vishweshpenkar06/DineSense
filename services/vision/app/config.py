from __future__ import annotations

import json
import os
import threading
from dataclasses import dataclass, replace
from typing import Any, Mapping

from .models import CameraSpec, TableZone, VisionSettings, parse_ts


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Environment:
    api_base_url: str = "http://web:3000"
    shared_secret: str = ""
    zones_file: str = "/data/zones.json"
    demo: bool = False
    force_file: bool = False
    tuning_log_path: str = "/data/tuning.csv"
    model_path: str = "/app/models/yolox_nano.onnx"
    model_conf: float = 0.35
    model_imgsz: int = 416
    device: str = "cpu"
    snapshot_fps: float = 1.0

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "Environment":
        env = os.environ if environ is None else environ

        def flag(name: str, default: bool = False) -> bool:
            return env.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}

        return cls(
            api_base_url=env.get("API_BASE_URL", "http://web:3000").rstrip("/"),
            shared_secret=env.get("VISION_SHARED_SECRET", ""),
            zones_file=env.get("ZONES_FILE", "/data/zones.json"),
            demo=flag("VISION_DEMO"),
            force_file=flag("VISION_FORCE_FILE"),
            tuning_log_path=env.get("TUNING_LOG_PATH", "/data/tuning.csv"),
            model_path=env.get("YOLO_MODEL", "/app/models/yolox_nano.onnx"),
            model_conf=float(env.get("YOLO_CONF", "0.35")),
            model_imgsz=int(env.get("YOLO_IMGSZ", "416")),
            device=env.get("YOLO_DEVICE", "cpu"),
            snapshot_fps=float(env.get("SNAPSHOT_FPS", "1")),
        )


def _coordinate(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ConfigError("polygon coordinates must be numbers")
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise ConfigError("polygon coordinates must be numbers") from error


def parse_polygon(raw: Any) -> tuple[tuple[float, float], ...]:
    if not isinstance(raw, (list, tuple)) or len(raw) < 3:
        raise ConfigError("polygon needs at least 3 points")
    points: list[tuple[float, float]] = []
    for point in raw:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise ConfigError("polygon points must be [x, y]")
        x = _coordinate(point[0])
        y = _coordinate(point[1])
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            raise ConfigError("polygon coordinates must be normalized 0..1")
        points.append((x, y))
    return tuple(points)


def parse_vision_config(
    payload: Mapping[str, Any],
    base_settings: VisionSettings,
    video_overrides: Mapping[str, str] | None = None,
) -> tuple[tuple[CameraSpec, ...], VisionSettings]:
    if not isinstance(payload, Mapping):
        raise ConfigError("config must be an object")

    raw_settings = payload.get("settings") or {}
    if not isinstance(raw_settings, Mapping):
        raw_settings = {}

    def number(key: str, fallback: float) -> float:
        value = raw_settings.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            return fallback
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            return fallback
        return parsed if parsed > 0 else fallback

    settings = replace(
        base_settings,
        seated_confirm_s=number("SEATED_CONFIRM_S", base_settings.seated_confirm_s),
        empty_confirm_s=number("EMPTY_CONFIRM_S", base_settings.empty_confirm_s),
    )

    raw_cameras = payload.get("cameras") or []
    if not isinstance(raw_cameras, list):
        raise ConfigError("cameras must be a list")

    cameras: list[CameraSpec] = []
    seen: set[str] = set()
    for raw_camera in raw_cameras:
        if not isinstance(raw_camera, Mapping):
            raise ConfigError("camera must be an object")
        camera_id = str(raw_camera.get("id") or "").strip()
        if not camera_id:
            raise ConfigError("camera id is required")
        if camera_id in seen:
            raise ConfigError(f"duplicate camera id {camera_id}")
        seen.add(camera_id)

        tables: list[TableZone] = []
        for raw_table in raw_camera.get("tables") or []:
            if not isinstance(raw_table, Mapping):
                raise ConfigError("table must be an object")
            table_id = str(raw_table.get("id") or "").strip()
            if not table_id:
                raise ConfigError("table id is required")
            tables.append(
                TableZone(
                    id=table_id,
                    label=str(raw_table.get("label") or table_id),
                    polygon=parse_polygon(raw_table.get("polygon")),
                    muted_until=parse_ts(raw_table.get("muted_until")),
                )
            )

        override = (video_overrides or {}).get(camera_id)
        video_path = raw_camera.get("video") or override
        cameras.append(
            CameraSpec(
                id=camera_id,
                name=str(raw_camera.get("name") or camera_id),
                rtsp_url=str(raw_camera.get("rtsp_url") or ""),
                tables=tuple(tables),
                video_path=str(video_path) if video_path else None,
            )
        )

    return tuple(cameras), settings


def load_zones_file(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ConfigError("zones file must contain a JSON object")
    return payload


class ConfigStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cameras: tuple[CameraSpec, ...] = ()
        self._settings = VisionSettings()

    def set(self, cameras: tuple[CameraSpec, ...], settings: VisionSettings) -> None:
        with self._lock:
            self._cameras = cameras
            self._settings = settings

    def snapshot(self) -> tuple[tuple[CameraSpec, ...], VisionSettings]:
        with self._lock:
            return self._cameras, self._settings

    def camera(self, camera_id: str) -> CameraSpec | None:
        with self._lock:
            for camera in self._cameras:
                if camera.id == camera_id:
                    return camera
        return None

    def settings(self) -> VisionSettings:
        with self._lock:
            return self._settings
