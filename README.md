# DineSense

**Local-first restaurant operations for a small two-floor Indo-Chinese restaurant.**
One mini PC runs the whole system on the venue LAN: camera table detection, the
3-minute “nobody took the order” alert, waiter/chef apps, reception billing and an
owner dashboard. No internet or cloud account is required during service.

**Status: v1 complete (Phases 1–8).** Engine, vision, waiter/chef PWAs,
reception/billing, admin, camera calibration, setup wizard, installer/backups/health
and pilot tooling are built and verified. The remaining work is on-site: hardware,
real-camera placement, staff devices and the pilot.

| Test | Result |
|---|---|
| Core domain (`npm run test:core`) | **119/119** |
| DB/API acceptance (`npm run acceptance`) | **119/119** |
| Vision service (`pytest`) | **36/36** |
| End-to-end Playwright (`npm run test:e2e`) | **8/8** |
| Typecheck | clean |

---

## Quick start

### Production install (Ubuntu mini PC)

Prerequisites: Ubuntu 22.04/24.04, 4+ cores, 8 GB RAM, a wired LAN connection and a
DHCP reservation for the mini PC. See `docs/HARDWARE.md`.

```bash
git clone <this-repo> /opt/dinesense
cd /opt/dinesense
sudo ./install.sh
```

The installer installs Docker + Compose if needed, creates random secrets in
`.env`, builds and starts the stack, creates the owner account, prints the admin
password and the URL, exports the Caddy root certificate, and schedules the nightly
backup.

Then:

1. Install `caddy-root.crt` on every phone/tablet (`docs/HTTPS.md`).
2. Open `https://<LAN-IP>/login` → **Admin password** → follow `/setup`:
   restaurant profile → default floors/tables → cameras → menu import → staff PINs
   → timers/tax → guided test → finish.
3. Install the PWA (“Add to Home Screen”) on staff devices.

| App | URL |
|---|---|
| First-run setup | `/setup` |
| Waiter | `/waiter` |
| Chef | `/chef` |
| Receptionist | `/reception` |
| Owner/admin | `/admin` |
| Dev console (builder only) | `/dev` (needs `ENABLE_DEV_CONSOLE=true`) |

Development seed credentials (demo database only): admin password `admin123`,
waiter PIN `1111`, chef `2222`, receptionist `3333`. Production installs use the
password printed by `install.sh`; change it in Admin → Staff after handover.

### Development (Docker Compose)

```bash
cp .env.example .env
docker compose up -d --build
docker compose run --rm migrate npm run db:seed -w @dinesense/db
```

Open `https://localhost` (Caddy internal CA) or `http://localhost:3000`. The demo
seed creates both floors (G1–G5, F1–F6), a small Indo-Chinese menu, two cameras and
the four demo users.

### Vision demo (no cameras)

```bash
docker compose run --rm vision python scripts/make_demo.py
VISION_DEMO=true docker compose up -d vision
```

Reset all tables to `free` in the dev console first. The 80-second looping video
seats customers (5-second demo confirm window), includes a walk-by that must not
trigger, and empties again. Real cameras use `VISION_DEMO=false` and the RTSP URLs /
polygons from the database.

---

## What it does

**Waiter (phone PWA)** — PIN keypad, “Start shift” sound/wake-lock unlock, one huge
“Next up” task, floor board with countdowns, tap-to-order menu with floor prices,
Half/Full and Dry/Gravy variants, quick notes, parcels, move table, request bill,
camera mute/monitor, and an offline order queue (`clientKey` idempotent).

**Chef (tablet)** — New / Preparing / Ready columns, oldest first, age timers
(amber 10 min / red 20 min), notes, By-dish aggregation, out-of-stock toggles,
new/cancelled chimes and wake lock.

**Receptionist (desktop)** — open visits with running totals and escalation flags,
bill with extras/discounts/item voids, automatic tax and round-off, split
cash/UPI/card payments, 80 mm/A4 print layouts, void and admin reopen with audit.

**Owner/admin** — dashboard presets (earnings, bills, average, orders/items,
top/bottom dishes, floor/hour/payment splits, operations), CSV export, menu manager
with CSV/XLSX import preview, floors/tables, staff credentials, timers/tax/business
day, restaurant profile, cameras/calibration, health and diagnostics, pilot review.

**The core rule** — a table becomes `occupied` when the camera confirms a seated
party; a 180-second deadline is stored in Postgres; if no order exists when it
expires, the worker creates a priority-2 “Table X is waiting to order” task. Menus,
timers, tax, table counts and staff all live in the database, never in code.

---

## Architecture

```
CCTV cameras (RTSP) ──► vision (Python · YOLO11n · ByteTrack)
                              │  table events + heartbeats (shared secret)
                              ▼
 Staff phones/tablet ◄──► Caddy HTTPS ◄──► web (Next.js UI + API + SSE)
                                               │
                                          PostgreSQL 16
                                               │
                                          worker (timers, tasks, health)
```

- **Local-first:** everything runs on the mini PC; internet is optional.
- **Realtime:** SSE fed by Postgres `LISTEN/NOTIFY`; clients resync via `/api/snapshot`.
- **Restart-safe:** deadlines, sessions, tasks and bills are in Postgres; the worker
  processes overdue timers immediately after a restart or power cut.
- **Privacy:** video stays in memory on the mini PC; only table states/counts reach the
  app. No frames are stored and no audio is used.

### Repository layout

```
apps/web          Next.js 15 App Router (all roles + API + SSE)
apps/worker       Node worker: timers, abandonment, task alerts, camera health
packages/core     Pure TypeScript domain logic + Vitest (state machine, bills, dates…)
packages/db       Prisma schema/migrations/seed + DB services (engine, jobs, reports…)
services/vision   FastAPI + YOLO11n + ByteTrack, pytest, demo generator
e2e               Playwright: devices, offline, reception, admin, cameras, setup, pilot
docs              INSTALL, HARDWARE, HTTPS, PILOT, quick guides
scripts           install/update/backup/restore/healthcheck/diagnostics, CA, icons
install.sh        one-command Ubuntu mini-PC install
docker-compose.yml
```

---

## Operations

```bash
docker compose ps                    # services
docker compose logs -f web worker    # logs
./scripts/healthcheck.sh             # 200 from /api/health
./scripts/backup.sh                  # manual backup now
./scripts/restore.sh backups/<file>  # replace all data (asks first)
./scripts/update.sh                  # backup → pull → build → migrate → health
./scripts/diagnostics.sh             # host logs + health bundle
./scripts/lan-ip.sh                  # LAN IP and .env lines
./scripts/export-ca.sh               # caddy-root.crt for staff devices
```

- **Health:** Admin → Health (database, worker tick, disk, last backup, clock skew,
  cameras) plus a diagnostics ZIP. Reception shows a warning banner when unhealthy.
- **Backups:** nightly at 03:00 to `backups/`, 14-day retention; optional
  `BACKUP_USB_PATH` or `BACKUP_RCLONE_REMOTE`. A restore into a scratch database was
  verified (21/21 tables).
- **Power cuts:** services restart with Docker; a power-cycle test kept users, tables,
  settings, login and an in-flight table deadline intact.
- **Updates:** the script rolls the code back if the health check fails and warns when
  the pre-update database backup should be restored.

---

## Tests and verification

```bash
npm run typecheck
npm run test:core             # pure engine/billing/business/import tests
npm run acceptance            # DB acceptance; needs migrated + seeded Postgres
npm run test:e2e              # Playwright; dev stack at 127.0.0.1:3000
docker compose run --rm --no-deps vision pytest
```

`npm run acceptance` exercises the real engine and database: the 180-second timer and
restart idempotency, orders/tasks, abandonment, vision mute, kitchen lifecycle,
takeaway, billing to the paisa, split payments, void/reopen, reports vs independently
summed raw bills, admin CRUD/menu import, camera encryption/filtering/calibration and
the setup/pilot flows. It resets runtime rows at the start and end; seed data remains.

The Playwright suite covers the two-device order flow, the offline queue exactly-once,
PWA shell, reception billing/printing, admin configuration/health/diagnostics, camera
calibration, setup wizard and pilot shadow mode. E2E needs the dev console reset
endpoint, so run it on a dev stack (`ENABLE_DEV_CONSOLE=true`).

**Verified evidence:** the hand-calculated bill (2×₹90 noodles + 2×₹20 water − 10%
+ 5% GST = ₹212.00, CGST/SGST ₹5.05 each, split ₹112 cash + ₹100 UPI); backup restore
21/21 tables; power-cycle timer/data persistence; HTTPS via Caddy's internal CA.

**Not verified on this machine:** a blank-PC `install.sh` run (no spare Ubuntu mini
PC), physical phones/tablets, real RTSP cameras, and paper printing. The scripts pass
`bash -n`; these are on-site handover checks.

### Handover smoke test

| # | Do this | Expect |
|---|---|---|
| 1 | `sudo ./install.sh` on the mini PC; install the CA | Stack up, admin password/setup URL printed |
| 2 | Complete `/setup` and the guided test | Table runs seat → alert → order → ready → served → paid → free |
| 3 | Seat a table; wait 3 min (or use the dev time-skip on a dev stack) | Red waiter alert, sound/vibration when shift is started |
| 4 | Order from Ground and AC tables | Correct floor price on each |
| 5 | Chef Start → Ready; waiter Mark served; request bill | Chef chime, food-ready alert outranks waiting, table dining |
| 6 | Reception: water, 10% discount, split payment, print | Correct totals; PAID; table needs_cleaning; 80 mm/A4 output |
| 7 | Airplane-mode an order, then reconnect | Queued once, one ticket, no duplicate |
| 8 | Chef stock toggle / By dish / cancel | Waiter menu greys instantly; aggregation and red cancellation |
| 9 | Admin menu import, floors/tables/staff/settings | Everything changeable without SQL |
| 10 | Admin dashboard vs cash book; CSV export | Totals match; CSV opens |
| 11 | Camera add/test/calibrate 11 zones; mute; offline | Correct zones, mute works, offline banner |
| 12 | Admin Health + diagnostics ZIP | DB/worker/disk/backup/clock/cameras; no secrets/video |
| 13 | Back up, restart the stack, verify data/timers | Everything resumes |
| 14 | Enable Shadow mode; review the Pilot day | Staff banner; corrections/mismatches and fix list |
| 15 | Install the PWA on the waiter phone/chef tablet | Standalone app over HTTPS |

---

## API surface

- **Auth:** `POST /api/auth/login|logout` · `GET /api/auth/me`
- **Live:** `GET /api/snapshot` · `GET /api/stream` (SSE)
- **Floor/waiter:** `GET /api/tables` · `POST /api/tables/:id/state|vision-mute` ·
  `POST /api/orders` · `POST /api/tasks/:id/action` · `POST /api/sessions` (parcel) ·
  `POST /api/sessions/:id/request-bill|move|served` · `GET /api/order-context` ·
  `GET /api/menu`
- **Kitchen:** `GET /api/kitchen/tickets` · `POST /api/orders/:id/start|ready|served` ·
  `POST /api/order-items/:id/cancel` · `POST /api/menu-variants/:id/availability` ·
  `GET /api/menu/stock`
- **Billing:** `GET /api/bills/open` · `GET /api/bills/:sessionId` ·
  `POST /api/bills/:sessionId/adjustments|pay|void|reopen`
- **Admin:** menu/floors/staff CRUD under `/api/admin/*` · menu import preview/import ·
  `/api/admin/settings|restaurant|cameras|diagnostics` · reports
  `GET /api/reports/summary|export.csv` · setup `GET|POST /api/admin/setup/*` ·
  pilot `GET /api/admin/pilot/review` · `PUT /api/admin/pilot/notes`
- **Health:** `GET /api/health` (DB, worker, disk, backup, clock, cameras)
- **Vision ingestion:** `POST /api/vision/events|heartbeat` · `GET /api/vision/config`
- **Vision service (localhost:8100, Bearer secret):** `/health` (public), snapshot,
  raw frame, `/test`, `/config/refresh`, `/tuning`
- **Dev only:** `/api/dev/simulate|order|time-skip|events|reset`

---

## Defaults and documented assumptions

- Timer **180 s**; timestamps UTC displayed in `Asia/Kolkata`; money integer paise.
- Business day starts **05:00** IST (configurable); bills/numbers/reports follow it.
- Tax defaults to **0/exclusive**; the owner sets rate/mode in Admin → Settings.
- Bill numbers allocate on first open, format `DS-<year>-<6 digits>`, never reused.
- A camera “empty” event is debounced by the vision service; the app adds
  `EMPTY_CONFIRM_S` before abandoning an unordered visit (safe bias, ~120 s total).
  An ordered/unpaid visit is never freed by the camera.
- Manual table override is always available and audited; setting a table to `free`
  voids the open visit.
- Takeaway prices use the first floor by sort (Ground/non-AC); stock toggles apply
  to all floors. Both are Phase 3 choices, changeable later.
- Camera RTSP credentials are AES-GCM encrypted at rest, visible only to the vision
  service (never to a browser). Calibration polygons are normalized 0–1 and apply in
  real-camera mode; `VISION_DEMO=true` uses `zones.json` and ignores database changes.
- Vision endpoints require the shared secret; only annotated snapshots reach staff
  through the authenticated web proxy. Raw frames are admin-only and in memory.
- Shadow mode is informational: alerts/orders/bills remain active; staff keep paper.
  The daily Pilot review compares manual overrides with the last camera event.
- Diagnostics contain health/settings/logs and the tuning CSV; no video, images, RTSP
  URLs or secrets.
- The installer targets Ubuntu with Docker; the pilot and on-site checks are described
  in `docs/PILOT.md`.

**Not in v1** (deliberate): customer QR ordering, payment gateway, tips, inventory,
multi-restaurant/cloud, native apps, voice, ESC/POS kitchen printing, table merging,
reservations, staff recognition, loyalty and WhatsApp/SMS.

---

## Documentation

| Document | Contents |
|---|---|
| `docs/INSTALL.md` | Blank mini PC → working install, setup wizard, CA, operations, troubleshooting |
| `docs/HARDWARE.md` | Mini PC/UPS specs, camera placement, Wi-Fi/AP isolation, printing |
| `docs/HTTPS.md` | Caddy internal CA, root certificate install on Android/iOS/Windows/macOS, real domain option |
| `docs/PILOT.md` | Shadow days → tuning → paper-backup week → sign-off checklist |
| `docs/QUICK-WAITER.md` | One-page waiter guide |
| `docs/QUICK-CHEF.md` | One-page chef guide |
| `docs/QUICK-RECEPTION.md` | One-page reception guide |
| `docs/QUICK-ADMIN.md` | One-page owner guide |
| `DineSense_Masterplan_v2.md` | Product requirements |

Built incrementally in eight phases; see `git log` for the engine, vision, staff apps,
billing, admin, camera, productization and pilot commits.
