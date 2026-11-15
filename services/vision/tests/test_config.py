import json
from datetime import datetime, timezone

import pytest

from app.config import (
    ConfigError,
    Environment,
    parse_polygon,
    parse_vision_config,
)
from app.models import VisionSettings

PAYLOAD = {
    "settings": {"SEATED_CONFIRM_S": 12, "EMPTY_CONFIRM_S": 45},
    "cameras": [
        {
            "id": "cam-1",
            "name": "Ground",
            "rtsp_url": "rtsp://user:pass@10.0.0.5/stream",
            "tables": [
                {
                    "id": "table-1",
                    "label": "G1",
                    "polygon": [[0.1, 0.1], [0.4, 0.1], [0.4, 0.5], [0.1, 0.5]],
                    "muted_until": "2026-11-15T15:00:00Z",
                }
            ],
        },
        {
            "id": "cam-2",
            "name": "First",
            "rtsp_url": "rtsp://user:pass@10.0.0.6/stream",
            "video": "/data/first.mp4",
            "tables": [
                {
                    "id": "table-2",
                    "label": "F1",
                    "polygon": [[0.5, 0.1], [0.9, 0.1], [0.9, 0.5], [0.5, 0.5]],
                }
            ],
        },
    ],
}


def test_parses_cameras_settings_and_mutes():
    cameras, settings = parse_vision_config(PAYLOAD, VisionSettings())
    assert len(cameras) == 2
    assert settings.seated_confirm_s == 12
    assert settings.empty_confirm_s == 45
    assert cameras[0].tables[0].label == "G1"
    assert cameras[0].tables[0].is_muted(datetime(2026, 11, 15, 14, 0, tzinfo=timezone.utc))
    assert cameras[1].video_path == "/data/first.mp4"
    assert cameras[1].rtsp_url.endswith("/stream")


def test_video_override_from_environment():
    cameras, _ = parse_vision_config(PAYLOAD, VisionSettings(), {"cam-1": "/data/ground.mp4"})
    assert cameras[0].video_path == "/data/ground.mp4"


def test_invalid_settings_fall_back_to_defaults():
    payload = {"settings": {"SEATED_CONFIRM_S": "nope", "EMPTY_CONFIRM_S": -3}, "cameras": []}
    _, settings = parse_vision_config(payload, VisionSettings())
    assert settings.seated_confirm_s == 20
    assert settings.empty_confirm_s == 60


def test_polygon_requires_three_points():
    with pytest.raises(ConfigError):
        parse_polygon([[0, 0], [1, 1]])


def test_polygon_requires_normalized_coordinates():
    with pytest.raises(ConfigError):
        parse_polygon([[0, 0], [1, 1], [2, 2]])


def test_polygon_rejects_non_numeric_points():
    with pytest.raises(ConfigError):
        parse_polygon([[0, 0], [1, "x"], [1, 1]])


def test_duplicate_camera_ids_are_rejected():
    payload = json.loads(json.dumps(PAYLOAD))
    payload["cameras"].append(payload["cameras"][0])
    with pytest.raises(ConfigError):
        parse_vision_config(payload, VisionSettings())


def test_environment_flags():
    env = Environment.from_env(
        {
            "VISION_DEMO": "true",
            "API_BASE_URL": "http://web:3000/",
            "YOLO_CONF": "0.5",
            "VISION_SHARED_SECRET": "s3cret",
        }
    )
    assert env.demo is True
    assert env.api_base_url == "http://web:3000"
    assert env.model_conf == 0.5
    assert env.shared_secret == "s3cret"


def test_environment_defaults_are_offline_safe():
    env = Environment.from_env({})
    assert env.demo is False
    assert env.force_file is False
    assert env.model_path == "yolo11n.pt"
