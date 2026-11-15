# DineSense

Local-first restaurant operations for a small two-floor Indo-Chinese restaurant.
One mini PC, no internet required, phones on the LAN.

**Status: Phase 2 — Core Engine + Vision.** The table state machine, the 3-minute
decision timer, waiter tasks, SSE realtime, the dev console and the Python vision
service (YOLO11n + ByteTrack, RTSP/video, debouncing, snapshots, tuning log) are
built and tested. Waiter/chef/reception/admin product screens, billing and the setup
wizard are later phases.

---

## What is built (Phases 1–2)

- Full Prisma data model for the whole product (§9 of the masterplan) with one
  migration, including a partial unique index that enforces one open visit per table.
- Pure, unit-tested business logic in `packages/core`:
  - every row of the table state machine (§6.3)
  - the 180s decision timer and the abandon rule
  - task priorities, floor-aware “next up”, snooze, re-alert and escalation
  - business-day boundaries (05:00 IST cutoff) and security helpers
- The DB-backed engine in `packages/db` used by both the web app and the worker.
- Vision contract endpoints (`events`, `heartbeat`, `config`) authenticated with a
  shared secret, idempotent by `event_id`, muting, and RTSP credential decryption.
- A worker process that fires overdue timers, abandons unordered parties that left,
  escalates/re-alerts tasks and writes a heartbeat — all restart-safe because the
  deadlines live in the database.
- Cookie/JWT auth with PIN login for staff, password for admin, and rate limiting.
- SSE `/api/stream` fed by Postgres `LISTEN/NOTIFY` plus `/api/snapshot` for resync.
- Dev console at `/dev` (admin only, `ENABLE_DEV_CONSOLE=true`): live 11-table grid,
  occupied/empty simulation, test orders, tasks, time-skip and event logs.
- Docker Compose: Postgres 16, migrations, web, worker, vision, Caddy placeholder.
- **Vision service** (`services/vision`): FastAPI + YOLO11n + ByteTrack on CPU,
  RTSP or recorded video, normalized table polygons, foot-point counting, the
  seated/empty debouncer, idempotent event posting with retry, heartbeats, config
  pull every 60s, `zones.json` fallback, annotated JPEG snapshots, auto FPS
  reduction with a `degraded` status, reconnect with backoff, and a tuning CSV.
- The worker marks a camera **offline after 30 seconds without a heartbeat** and
  the next heartbeat restores it; manual table control keeps working.

### Acceptance covered by `npm run acceptance`

1. Simulated occupancy starts a 180s deadline; a fresh worker process fires the
   overdue timer exactly once and creates one `needs_order` task.
2. An order placed before the deadline cancels the alert permanently.
3. Re-running the timer job (a restart) creates no duplicate tasks.
4. The same vision `event_id` twice creates one event and one visit.
5. `VISION_EMPTY` never frees a table with an unpaid ordered visit.
6. An unordered party that leaves is closed as `ABANDONED` after `EMPTY_CONFIRM_S`,
   its task is cancelled and the table returns to `free`.
7. Vision mute suppresses events until it expires.
8. Manual override writes an audit log.
9. Escalation after 120s and repeat alerts after 60s.
10. Vision config returns all 11 tables, polygons and decrypted RTSP URLs.
11. Camera heartbeat → `OK`, 30s without one → `OFFLINE`, next heartbeat → `OK`.

### Phase 2 acceptance (vision)

Verified with the generated demo video on the real CPU model:

- G3 and F3 become `occupied` after the 5s demo confirm window and return to
  `empty` when the customers leave.
- A person walks through G2/F2 for ~3 seconds: the detector reports `person_count=1`
  but the debounced state stays `empty` (proven in `tuning.csv`).
- Stopping the vision container makes both cameras `OFFLINE` after 30s in the web
  app; restarting it restores `OK` and resends the full table state.
- `GET http://127.0.0.1:8100/snapshot/<camera_id>.jpg` returns an annotated JPEG.
- 36 pytest tests cover geometry, the debouncer, FPS adaptation, config parsing and
  the retrying event sender.

**Measured on this machine** (i7-12700H, CPU only, YOLO11n at 640, 2 demo cameras):
~2.5 FPS per camera, ~193% CPU of one core (≈10% of the 20 threads), 621 MiB RSS,
2.57 GB image (Torch CPU + baked `yolo11n.pt`). For 4 cameras on a small mini PC,
export ONNX/OpenVINO and cap Torch threads; the governor already drops to 1 FPS and
reports `degraded` when it cannot keep up.

---

## Repository layout

```
apps/web          Next.js 15 App Router (UI + API + SSE)
apps/worker       Node worker: timers, abandonment, task alerts
packages/core     Pure TypeScript domain logic + Vitest tests
packages/db       Prisma schema/migrations/seed + DB services (engine, jobs, orders)
services/vision   Python FastAPI + YOLO11n vision service, pytest, demo generator
deploy/Caddyfile  Phase 1 reverse-proxy placeholder
docker-compose.yml
```

## Quick start (Docker Compose)

Requires Docker Engine with Compose v2/v5 (x86 mini PC).

```bash
# Fedora, one-time (needs root):
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
# then log out and back in, or run `newgrp docker`

cp .env.example .env        # edit secrets before real use
docker compose up -d --build
docker compose run --rm migrate npm run db:seed -w @dinesense/db
```

The first build includes the 2.6 GB vision image (CPU Torch + model). Without real
cameras the vision service will show the seeded cameras as offline, which is expected.

### Vision demo (no cameras needed)

```bash
# generates /data/zones.json + two videos using the real table IDs/polygons
docker compose run --rm vision python scripts/make_demo.py
VISION_DEMO=true docker compose up -d vision
```

Reset every table to `free` in the dev console before the demo. The demo uses 5s
confirm windows (instead of 20s/60s) so the cycle is quick; a sitter occupies a
table, a walk-by crosses another zone without triggering, and tables empty again
when the video loop clears. Real cameras use `VISION_DEMO=false` (the default) and
the polygons/RTSP URLs from the database; credentials never reach a browser.

On Ubuntu/Debian install `docker-ce` and `docker-compose-plugin` from Docker's
official repository. Verify with `docker compose version`. The stack is Docker-only;
Podman is not a supported install path for this project.

Open <http://localhost:3000> (or the Caddy placeholder at <http://localhost:8080>).

Seed credentials (development only):

| Role | Login |
|---|---|
| Admin / owner | password `admin123` |
| Waiter | PIN `1111` |
| Chef | PIN `2222` |
| Receptionist | PIN `3333` |

Change these before a real install; the setup wizard arrives in Phase 7.

## Local development (no Compose)

```bash
npm install
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local
# start Postgres 16 on localhost:5432 with user/password/db = dinesense
npm run db:generate
npm run db:migrate            # applies prisma/migrations
npm run db:seed               # add -- --force to reset
npm run dev:worker            # terminal 1
npm run dev:web               # terminal 2
```

## Tests and checks

```bash
npm run test:core             # pure domain tests (no DB)
npm run typecheck             # all workspaces
npm run acceptance            # needs migrated + seeded Postgres
docker compose run --rm --no-deps vision pytest   # 36 vision tests
```

`npm run acceptance` exercises the engine against the real database and spawns a
fresh Node process for the “worker restart” case. It resets runtime rows at the
start and end; menu/zone/table seed data is untouched.

## Dev console walkthrough

1. Sign in as admin at `/login`.
2. Press **Someone sat** on table G3: it turns amber and shows `auto-alert 3:00`.
3. Wait 3 minutes (or press **−180s** in Simulation and give the worker ≤5s):
   the table turns red, the task appears with sound-ready priority 2 copy
   (“Table G3 (Ground Floor) is waiting to order”), and the header shows it.
4. Press **Test order** before the deadline (seat another table first): state
   becomes blue, the task disappears, and the KOT appears under “Active kitchen tickets”.
5. Press **Table left** on an unordered table: after `EMPTY_CONFIRM_S` (60s, or
   time-skip) the visit is abandoned and the table returns to green.
6. **Mute camera** suppresses occupancy for 5 minutes.
7. **Manual override** sets any state and writes an audit row.
8. Run the vision demo: cameras show `OK` with ~2.5 FPS, the vision-event log fills,
   and the annotated snapshot is available on port 8100. Stop the vision container:
   after 30s the dev console shows “Camera offline — set tables manually.”

## Manual verification (Phase 1)

Use this list at handover. Reset by setting every table to `free` in the dev console.

| # | Do this | Expect |
|---|---|---|
| 1 | Seat G3 | Amber card, `auto-alert 3:00` counting down |
| 2 | Press `−180s`, wait ≤5s | Full-width red "Waiter alert · Table G3 (Ground Floor) is waiting to order" banner, G3 red, one P2 task |
| 3 | Press Acknowledge | Task becomes `ack` and stays visible until an order exists |
| 4 | Seat F2 and press Test order before its timer ends | Blue `Ordered`, no needs_order task; a later `−180s` never creates one |
| 5 | Snooze a needs_order task, then `−300s` | Task disappears during snooze, then returns as `open` |
| 6 | Press `−120s` on an open task | Task escalates (red task card in the console, `escalatedAt` set) |
| 7 | Seat G5 then press Table left; `−60s` | Table returns to green, visit closed as abandoned, its task cancelled |
| 8 | Order at G4, press Table left, `−60s` | Table stays `Ordered` — camera never frees an unpaid visit |
| 9 | Mute G1, press Someone sat; Unmute, press Again | Stays free while muted, becomes occupied after unmute |
| 10 | Manual override to `needs_cleaning` then manual `free` | State changes; the manual action is audited |
| 11 | Press Test order twice | KOT increments (1, 2, …), ticket list shows both |
| 12 | `docker compose restart worker` while a timer counts | The alert still fires exactly once after restart |
| 13 | `docker compose down && docker compose up -d` | All data survives; the login and open visits are still there |
| 14 | `curl localhost:3000/api/health` | `database.ok=true`, `worker.healthy=true` |

The dev console has **no sound or vibration** — that arrives with the waiter PWA in
Phase 3. The alert here is the red banner, red table card and the task. `docker compose
logs -f worker` shows a tick failure if anything is wrong.

### Vision verification

| # | Do this | Expect |
|---|---|---|
| V1 | Run the demo, reset tables, wait ~15s | G3/F3 turn occupied from the video alone |
| V2 | Watch G2/F2 during the walk-by | Person count >0 in `tuning.csv`, state stays `empty` |
| V3 | Wait for the sitters to leave | Tables return to empty after the confirm window |
| V4 | `docker compose stop vision`, wait 35s | Both cameras `OFFLINE`, amber banner in `/dev` |
| V5 | `VISION_DEMO=true docker compose up -d vision` | Cameras `OK`, table state resyncs |
| V6 | Open `http://127.0.0.1:8100/health` | Per-camera status, FPS, queue and config source |
| V7 | Open `http://127.0.0.1:8100/snapshot/<camera_id>.jpg` | Annotated zones (green/red) and FPS header |

## API surface (Phases 1–2)

- `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET /api/snapshot` · `GET /api/stream` (SSE, role-filtered)
- `GET /api/tables` · `POST /api/tables/:id/state` · `POST /api/tables/:id/vision-mute`
- `POST /api/orders` (waiter/receptionist/admin, `clientKey` idempotent)
- `POST /api/tasks/:id/action` (`ack` · `snooze` · `done`)
- `POST /api/vision/events` · `POST /api/vision/heartbeat` · `GET /api/vision/config`
- `GET /api/health` (DB, worker heartbeat, camera status)
- Vision service (inside the LAN / bound to 127.0.0.1: `8100`): `GET /health`,
  `GET /snapshot/{camera_id}.jpg`
- Dev-only: `POST /api/dev/simulate` · `POST /api/dev/order` · `POST /api/dev/time-skip` · `GET /api/dev/events`

## Assumptions and defaults (Phases 1–2)

- **Vision debounce lives in the vision service**, so an incoming `occupied`/`empty`
  event is treated as already confirmed. The app additionally waits
  `EMPTY_CONFIRM_S` on an empty reading before abandoning an unordered visit, which
  is the safe bias required by the masterplan. A real camera therefore frees an
  abandoned table in ~120s; staff can override at any time.
- **Vision input:** one YOLO model per camera (ByteTrack tracker isolation), 640 px,
  CPU. RTSP substreams are recommended. The service pulls polygons, mute deadlines
  and confirm windows from `/api/vision/config` every 60s; `zones.json` is used only
  in demo/forced-file mode.
- **Demo speed:** the generated `zones.json` uses 5s confirm windows and loops an
  80s video. Mute changes made in the dev console are not reflected in demo-file
  mode; use API config mode to test mute.
- **Snapshots** are served by the vision service on `127.0.0.1:8100` only. The
  browser-facing proxy (`/api/camera/:id/snapshot.jpg`) arrives with the camera
  screen in Phase 6; browsers never receive RTSP credentials.
- **Tuning log:** `services/vision/demo/tuning.csv` (bind-mounted `/data/tuning.csv`)
  stores per-table counts and debounced states, never images.
- **Manual override** changes the table state; setting a table to `free` voids the
  open visit and cancels its tasks, and the action is audited.
- **Takeaway ordering** is intentionally rejected until Phase 3 introduces the
  waiter app flow; the schema and session model already support it.
- **Time-skip** in the dev console moves stored deadlines/empty timestamps backwards;
  it never changes the server clock.
- **shadcn/ui** is deferred to the product screens. The Phase 1 dev console is plain
  Tailwind (it is an internal tool, not a staff surface).
- Timestamps are stored UTC and rendered in `Asia/Kolkata`. Money is integer paise;
  billing is not implemented yet.

## Not built yet

Phase 3 waiter/chef PWAs + HTTPS, Phase 4 billing, Phase 5 admin, Phase 6 camera
calibration/proxy, Phase 7 productization.
