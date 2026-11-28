import hashlib
from pathlib import Path

import numpy as np
import pytest

from app.detector import decode_yolox_output, EXPECTED_MODEL_SHA256

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "models" / "yolox_nano.onnx"


def test_model_is_bundled_with_expected_checksum():
    assert MODEL.exists()
    assert hashlib.sha256(MODEL.read_bytes()).hexdigest() == EXPECTED_MODEL_SHA256


def test_decode_keeps_person_class_only():
    output = np.zeros((1, 2, 85), dtype=np.float32)
    output[0, 0, :4] = [100, 100, 20, 40]
    output[0, 0, 4] = 0.9
    output[0, 0, 5] = 0.8
    output[0, 1, :4] = [100, 100, 20, 40]
    output[0, 1, 4] = 0.9
    output[0, 1, 6] = 0.7
    boxes = decode_yolox_output(output, conf=0.5, input_size=640, original_shape=(200, 200, 3), scale=1.0, pad=(0, 0))
    assert len(boxes) == 1
    assert boxes[0].confidence == pytest.approx(0.72)
    assert boxes[0].x1 == pytest.approx(90)
    assert boxes[0].y1 == pytest.approx(80)
