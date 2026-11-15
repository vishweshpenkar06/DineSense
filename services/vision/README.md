# Vision service (Phase 2)

This directory will hold the Python vision service:

- RTSP or recorded-video input
- YOLO11n person detection + ByteTrack
- per-table polygon counting
- debouncer (SEATED_CONFIRM_S / EMPTY_CONFIRM_S)
- event + heartbeat posting to the web API
- annotated snapshot endpoint
- tuning CSV log

Phase 1 only ships the contract it will consume. The web app already exposes:

- `POST /api/vision/events` (Bearer `VISION_SHARED_SECRET`)
- `POST /api/vision/heartbeat` (Bearer `VISION_SHARED_SECRET`)
- `GET /api/vision/config` (Bearer `VISION_SHARED_SECRET`)

All three are implemented and covered by the Phase 1 acceptance script. Nothing in this
folder is required to run Phase 1.
