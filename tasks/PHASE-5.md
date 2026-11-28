# Phase 5 report — camera detector and privacy

| Task | Status | Evidence | Files |
|---|---|---|---|
| V-1 | done | YOLOX repo licence fetched: Apache 2.0; ONNX Runtime 1.32.0 PyPI metadata: MIT; model bundled with SHA-256; vision pytest 38/38 including checksum and decoder tests | `services/vision/app/detector.py`, `services/vision/models/yolox_nano.onnx`, `services/vision/THIRD_PARTY_NOTICES.md`, `services/vision/Dockerfile`, requirements, `scripts/measure_detection.py` |
| V-2 | done | Playwright: chef snapshot 403, waiter snapshot 200, admin toggle default on; README privacy statement corrected | `apps/web/src/app/api/camera/[id]/snapshot.jpg/route.ts`, settings, admin UI, `e2e/security.spec.ts`, `README.md` |

Licence verification: YOLOX source and released weights are from `Megvii-BaseDetection/YOLOX` under Apache 2.0. ONNX Runtime 1.32.0 is MIT by PyPI metadata. Ultralytics, Torch and TorchVision are no longer installed or used. Tracking was removed because tracking IDs were unused.

Verification: typecheck clean, core 140/140, acceptance 150/150 on scratch DB, vision pytest 38/38, Playwright 18/18, production build clean.

Updated old test: `services/vision/tests/test_config.py` expects the bundled YOLOX ONNX model instead of `yolo11n.pt`.

Not verified: detection accuracy on real restaurant footage; no accuracy claim is made. Physical CCTV signage placement remains on site.

Owner decision needed: legal sign-off on bundled Apache/MIT notices and confirmation of the CCTV notice wording.
