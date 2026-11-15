# DineSense Vision (Phase 2)

FastAPI + Ultralytics **YOLO11n** + **ByteTrack** person detection for the restaurant
tables. Runs on CPU inside the restaurant, posts only table states/counts to the web
app, stores no frames.

## Pipeline

```
RTSP substream or video file
  → sample at 3 FPS (governor drops to 1 FPS under load, status=degraded)
  → YOLO11n (person class) + ByteTrack IDs
  → foot point (bottom-centre) inside each table polygon (normalized 0–1)
  → per-table debouncer:
       occupied: ≥1 person for SEATED_CONFIRM_S, gaps ≤ GAP_TOLERANCE_S tolerated
       empty:   0 people for EMPTY_CONFIRM_S
       bias:    when unsure, stay occupied
  → POST /api/vision/events on change (UUID event_id, retried forever with backoff)
  → POST /api/vision/heartbeat every 10s
  → annotated JPEG snapshots at ~1 FPS
  → CSV tuning log (counts + debounced state, no images)
```

`GET /health` reports per-camera status/FPS, config source/error, event queue stats.

## Running

The repository's `docker-compose.yml` includes the service:

```bash
docker compose up -d --build
```

Without real cameras it tries the seeded demo RTSP URLs, fails to connect, and
reports `offline`; the app then shows “Camera offline — set tables manually.”

### Modes

| Mode | Enabled by | Input |
|---|---|---|
| API config (default) | `VISION_DEMO=false` | `GET /api/vision/config` every 60s; RTSP URL per camera; muting/polygon updates flow from the app |
| Zones file | `VISION_DEMO=true` or `VISION_FORCE_FILE=true` | `ZONES_FILE` (default `/data/zones.json`); each camera may have a `video` path |

`zones.json` uses the same shape as the API response plus an optional `"video"` per
camera. See `zones.example.json`.

### Demo (no cameras)

```bash
docker compose run --rm vision python scripts/make_demo.py
VISION_DEMO=true docker compose up -d vision
```

The generator pulls the real camera/table UUIDs and polygons from the web API,
downloads Ultralytics' sample image, composites person crops onto a synthetic floor,
writes `camera_1.mp4`/`camera_2.mp4` and `/data/zones.json`, then verifies that YOLO
finds people in the result. Demo windows are 5s/5s; the timeline is:

- 0–8s: empty
- 8–68s: one person sitting at the third table per camera
- 18–22s: a person walks through the second table (4s, must not trigger)
- 30–68s: a second sitter at the first table
- 68–80s: everyone leaves; tables empty after the 5s window
- the video loops after 80s

Reset all tables to `free` in the dev console before starting. The demo zones file is
static, so dev-console camera mute is not visible in demo mode (API mode honors it).

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `API_BASE_URL` | `http://web:3000` | web app base URL |
| `VISION_SHARED_SECRET` | — | Bearer token for `/api/vision/*` |
| `ZONES_FILE` | `/data/zones.json` | fallback/demo config |
| `VISION_DEMO` | `false` | force file mode and use per-camera videos |
| `VISION_FORCE_FILE` | `false` | force file mode with real RTSP? usually for tuning |
| `TUNING_LOG_PATH` | `/data/tuning.csv` | tuning CSV path |
| `YOLO_MODEL` | `yolo11n.pt` | model path baked into the image |
| `YOLO_CONF` | `0.35` | person confidence threshold |
| `YOLO_IMGSZ` | `640` | inference size |
| `YOLO_DEVICE` | `cpu` | `cpu`, `cuda`, `mps` |
| `SNAPSHOT_FPS` | `1` | annotated JPEG rate |
| `WORKER_*` | — | not used here |

## Endpoints

- `GET /health` — service/camera status, FPS, queue, config source
- `GET /snapshot/{camera_id}.jpg` — latest annotated JPEG (polygons green/red,
  person counts, camera FPS header)

The port is published as `127.0.0.1:8100` in Compose. Browsers will use the web
proxy (`/api/camera/:id/snapshot.jpg`) when the camera screen lands in Phase 6.
RTSP credentials never leave the server side.

## Tests

```bash
docker compose run --rm --no-deps vision pytest
```

36 tests cover point-in-polygon/foot-point counting (including the pixel→normalized
bug), the debouncer (walk-bys, gap tolerance, empty windows, blips), FPS adaptation,
config parsing/validation, and the retrying event sender. The service requires
Python 3.11 + Torch; use the image rather than the host Python.

## Measured performance

On an i7-12700H, CPU only, 2 cameras, YOLO11n at 640, 3 FPS target:

- ~2.5 FPS per camera (target 3; governor stays `ok` because per-frame time is under
  the 1.5× budget, the shortfall is the 1 FPS snapshot/annotation + video pacing)
- ~193% CPU of one core (≈10% of the 20 threads), 621 MiB RSS
- image 2.57 GB (Torch CPU + opencv + baked `yolo11n.pt`)

For 4 cameras on a 4-core mini PC, export ONNX/OpenVINO, cap Torch threads
(`OMP_NUM_THREADS`), and use camera substreams; the governor already reduces to
1 FPS and sends `status=degraded` when it cannot keep up.

## Failure behaviour

- Stream drops or RTSP cannot open → reconnect with exponential backoff (1→30s),
  heartbeat `offline`; the app marks the camera offline after 30s without any
  heartbeat, and restores `OK` on the next heartbeat.
- Web app down → events queue (max 500, oldest dropped) and retry forever; the
  pipeline never blocks. Duplicate event IDs are ignored by the app.
- Overload → FPS target drops (min 1) and heartbeats/annotations say `degraded`.
- Muted table → states keep updating internally but no events are sent; the current
  state is sent once mute expires.

## Privacy

Processing is on-site. Only `{state, person_count, confidence}` leaves the service;
no frames are stored. The annotated JPEG is in memory only and is not recorded.
