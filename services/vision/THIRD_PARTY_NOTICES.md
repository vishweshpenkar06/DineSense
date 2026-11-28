# Third-party notices

## YOLOX (code and released ONNX weights)

- Source: https://github.com/Megvii-BaseDetection/YOLOX
- Copyright: 2021-2022 Megvii Inc.
- Licence: Apache License 2.0
- Bundled model: `models/yolox_nano.onnx`
- SHA-256: `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d`
- Download: https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx

YOLOX is licensed under Apache 2.0. The released weights are distributed from the same project release and are treated as part of that project. A copy of the Apache 2.0 licence must accompany any distribution of this image.

## ONNX Runtime

- Source: https://github.com/microsoft/onnxruntime
- Package: `onnxruntime==1.32.0`
- Licence: MIT
- Verified from PyPI metadata: `onnxruntime 1.32.0`, `License :: OSI Approved :: MIT License`

## OpenCV and NumPy

- `opencv-python-headless==4.10.0.84`: Apache License 2.0 / OpenCV licence
- `numpy==1.26.4`: BSD-3-Clause

The detector intentionally uses no tracking library. Tracking IDs were unused; `count_in_polygon` receives person-only detections.
