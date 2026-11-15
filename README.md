# DineSense

Local-first restaurant operations for a small two-floor Indo-Chinese restaurant.
One mini PC, no internet required, phones on the LAN.

**Status: Phase 5 — Admin.** The engine, vision, waiter/chef PWAs, LAN HTTPS, the
offline queue, the kitchen lifecycle and reception/billing are built. The owner can
now configure the restaurant (menu/import, floors, tables, staff, settings) and read
sales/operations reports without touching the database. The setup wizard and
camera calibration are later phases.

---

## What is built (Phases 1–5)

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
- **Waiter PWA** (`/waiter`): PIN keypad, shift sound unlock + wake lock + vibration,
  “Next up” task, floor board with countdowns, order screen with floor prices,
  variants, quick notes and free text, parcels, move table, request bill, camera
  mute, and a cameras tab with annotated live images.
- **Chef PWA** (`/chef`): New / Preparing / Ready columns, age timers (amber/red),
  notes, By-dish aggregation, stock toggles, chimes for new and cancelled tickets.
- **Offline-tolerant ordering:** carts that cannot reach the server are stored in
  the browser and retried with the same `clientKey`, so a flaky phone never creates
  two tickets.
- **Kitchen lifecycle:** start/ready/served, item cancellation rules (waiter before
  cooking; reception/admin after, with a reason), takeaway tickets, stock changes and
  bill requests.
- **PWA shell + HTTPS:** manifest, icons, service worker, standalone install, Caddy
  with an internal CA, root-certificate export script and device install docs.
- **Reception workspace** (`/reception`): open visits with running totals, bill
  requests and escalated-waiter flags, bill screen, item voids, extras, fixed/percent
  discounts, split payments, voids and admin reopen.
- **Billing engine:** snapshotted per-floor prices, zone surcharge rules, inclusive
  or exclusive tax with CGST/SGST, round-off to the rupee, per-year sequential bill
  numbers that are never reused, payment settlement, and audit logs for every
  override.
- **Printing:** browser print layouts for 80 mm thermal and A4 with restaurant
  profile, GSTIN, tax lines, payments and footer.
- **Dev runtime reset** (`POST /api/dev/reset`, admin + dev flag) for demos and E2E.
- **Admin workspace** (`/admin`): dashboard with presets and CSV export, menu manager,
  CSV/XLSX menu import with preview/warnings, floors & tables, staff credentials,
  restaurant profile and timer/tax/business-day settings.
- **Reports:** earnings, bills, average bill, orders and items; top/bottom dishes;
  earnings by floor, hour and payment method; seated→order, order→ready and alert
  response times. Business-day ranges use the configurable IST cutoff.
- **Admin rules/audit:** every configuration change is audited; items/variants with
  order history are archived instead of deleted; staff can be deactivated; the owner
  cannot deactivate themselves; invalid settings/PINs are rejected.

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

### Phase 3 acceptance (staff apps)

- `npm run acceptance`: **101/101** checks across Phases 1–5 (kitchen, takeaway,
  stock, bills, tax, payments, voids, reopen, reports, admin CRUD, menu import).
- `npm run test:e2e`: **5/5** Playwright tests:
  1. waiter seats G3 → orders → chef starts/readies → waiter serves → requests bill,
     across two independent browser contexts;
  2. the waiter phone goes offline mid-order, the order is queued, and after
     reconnecting exactly one ticket is created for G5;
  3. manifest, icons and the service worker are served and registered;
  4. reception adds an extra, a 10% discount, splits cash/UPI payment and checks the
     80 mm/A4 print widths and content;
  5. the owner changes a timer, adds/removes a table and imports a menu from CSV
     through `/admin`, then restores the settings and cleans the test rows.
- HTTPS verified end-to-end through Caddy's internal CA, including staff login; the
  camera proxy returns `image/jpeg` for staff and `401` for anonymous callers.

### Phase 4 acceptance (billing)

Hand-calculated example (ground floor, 5% exclusive tax, 10% discount):

```
2 × Veg Hakka Noodles Half @ ₹90      ₹180.00
2 × water bottles @ ₹20                ₹40.00
10% discount                          −₹18.00
taxable                                ₹202.00
CGST 2.5% + SGST 2.5%                   ₹10.10
unrounded total                        ₹212.10
round off                              −₹0.10
TOTAL                                  ₹212.00
split: cash ₹112.00 + UPI ₹100.00
```

The acceptance script verifies every paise, the tax split, split payments, the
bill number format, `needs_cleaning` + cleaning task after payment, void number
retention, admin reopen with payment reversal, and inclusive tax
(`₹400` inclusive at 5% → taxable `₹380.95`, tax `₹19.05`, total unchanged).
Physical thermal/A4 paper was not available; the print CSS widths and content are
verified headlessly and need a manual check on the owner's printer.

### Phase 5 acceptance (admin)

- Reports match independently computed raw bills: earnings, bill count, order/item
  counts, floor split, payment split and the item CSV were compared after a known
  paid bill. A bill moved to 02:00 IST is included in the previous business day and
  excluded from the current one.
- Settings update and validation (invalid decision window rejected, then restored);
  floor/table create→edit→delete; staff create→PIN reset→self-deactivation guard→
  deactivate; menu import with two floor prices and a deliberately missing floor
  price (variant unavailable there); imported rows cleaned up again.
- The owner E2E does all of the above through `/admin`, without SQL.
- `exceljs` is the only new dependency, used server-side to read XLSX files; CSV is
  parsed by the pure, tested `parseCsv`.

Physical phones/tablets were not available; the two-device flow used two independent
browser contexts, and network loss used Chromium's offline mode. Install the CA and
run the manual list below on real hardware at handover.

---

## Repository layout

```
apps/web          Next.js 15 App Router (UI + API + SSE)
apps/worker       Node worker: timers, abandonment, task alerts
packages/core     Pure TypeScript domain logic + Vitest tests
packages/db       Prisma schema/migrations/seed + DB services (engine, jobs, orders)
services/vision   Python FastAPI + YOLO11n vision service, pytest, demo generator
e2e               Playwright: two-device order flow, offline queue, PWA shell
deploy            Caddyfile (internal CA) and Caddyfile.acme
docs              HTTPS/root-certificate guide
scripts           PWA icons, CA export
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

Open **https://<LAN-IP>** (Caddy internal CA; install `caddy-root.crt` once per phone
— see `docs/HTTPS.md`). `https://localhost` works when `SITE_ADDRESS=localhost`.
The direct dev URL <http://localhost:3000> also works for PWA testing because
localhost is a secure context.

For a hotel/restaurant Wi-Fi deployment, the mini PC and staff devices must be on the
same network with **AP/client isolation off**, and the mini PC should have a DHCP
reservation. Run `./scripts/lan-ip.sh` to get the exact `.env` lines. If the venue
blocks device-to-device traffic, use a dedicated staff router/AP.

| App | URL |
|---|---|
| Waiter | `/waiter` |
| Chef | `/chef` |
| Receptionist | `/reception` |
| Dev console (admin) | `/dev` |

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
npm run acceptance            # needs migrated + seeded Postgres (81 checks)
npm run test:e2e              # Playwright; needs the stack at 127.0.0.1:3000 (4 tests)
docker compose run --rm --no-deps vision pytest   # 36 vision tests
```

For deterministic E2E runs, stop the demo vision service first
(`docker compose stop vision`) so the video does not change table states mid-test.
The Playwright setup calls the admin-only `POST /api/dev/reset` before each test.

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

## Waiter and chef walkthrough

1. Sign in with a PIN. Waiters land on `/waiter`, chefs on `/chef`.
2. Tap **Sound is off — tap to start your shift**: this unlocks audio, requests the
   screen wake lock and confirms the alert chime.
3. **Waiter:** tap **Seat table** on G3 (manual override; vision does this
   automatically in production), then **Order**. Tap a size, adjust quantity/notes
   and **Send to kitchen**. The chef's board updates over SSE.
4. **Chef:** tap **Start**, then **Ready**. The waiter's Next-up shows the
   higher-priority “food is ready — pick up” task with sound/vibration.
5. **Waiter:** tap **Mark served**. When every ticket is served the table becomes
   Dining. **More actions → Request bill** flags it for the receptionist.
6. **Chef:** toggle **By dish** for the aggregated pick list; use **Stock** to mark a
   variant out of stock (the waiter menu greys it immediately). Cancelled tickets
   flash red with a different tone.
7. **Parcel:** **+ New parcel** creates a takeaway visit and a ticket with no table.
8. **Move:** on a table card, **More actions → Move to table**.
9. **Offline:** add items, switch the phone to airplane mode, press Send. The board
   shows “order queued”; when the network returns it is sent once with the same
   `clientKey`.
10. **Cameras:** `/waiter/cameras` shows the annotated vision feed per floor and an
    offline notice.

## Reception walkthrough

1. Sign in with PIN `3333`; you land on `/reception`.
2. The left column lists open visits with running totals, **Bill requested** and
   **Waiter not responding** flags. Escalated waiter tasks also appear in a red
   banner.
3. Select a table. The bill gets its sequential number, the items, extras, discount,
   tax lines, round-off and total.
4. Add **Packaged Water** with one tap, add a fixed or percent discount, and void a
   line item with a reason if needed.
5. Split the payment across cash/UPI/card (overpayment shows change), then
   **Take payment & close**. The bill becomes PAID and the table moves to
   needs_cleaning.
6. Print 80 mm or A4. Void an open bill, or reopen a paid bill as admin (payments are
   reversed and recorded in the audit log).
7. Tax is 0 until the owner sets `TAX_RATE_PERCENT` / `TAX_MODE` in
   **Admin → Settings**; the bill engine supports both exclusive and inclusive GST.

## Admin walkthrough

1. Sign in as admin (`admin123` seed; password login, not PIN) and open `/admin`.
2. **Overview:** pick Today/Yesterday/Last 7 days/This month or a custom range. Check
   earnings, bills, average bill, orders/items, top/bottom dishes, floor/hour/payment
   splits and operational times. **Export CSV** downloads item-level rows for the
   same range.
3. **Menu:** add categories/items/variants and per-floor prices; mark items/variants
   unavailable; import a CSV/XLSX with the documented columns. The preview shows
   row errors and missing-floor-price warnings before importing.
4. **Floors & tables:** add/rename floors, set AC/surcharge, add/edit/remove tables
   and assign cameras. New tables appear on the waiter board immediately.
5. **Staff:** add waiters/chefs/receptionists with a 4–6 digit PIN, or admins with a
   password; reset credentials and deactivate people. You cannot deactivate yourself.
6. **Settings:** timers, tax rate/mode, bill prefix, business-day start and the
   restaurant profile/GSTIN (used on printed bills). Invalid values are rejected.
7. The dev console remains at `/dev` for simulation and diagnostics.

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

### Staff app verification (Phase 3)

| # | Do this | Expect |
|---|---|---|
| A1 | PIN `1111` / `2222` | Waiter → `/waiter`, chef → `/chef` |
| A2 | Start shift | Green “Sound on · screen stays awake” bar |
| A3 | Seat G3, order two items, send | Chef ticket for G3 within 1–2s |
| A4 | Chef Start → Ready | Waiter gets a food-ready alert that outranks waiting-to-order |
| A5 | Waiter Mark served | Table becomes Dining; task disappears |
| A6 | Request bill | Table becomes Bill requested (payment is Phase 4) |
| A7 | Chef By dish | Quantities aggregate across tables |
| A8 | Chef marks a variant out of stock | Waiter menu greys it without reload |
| A9 | Ground vs AC table order screens | Same dish shows each floor's price |
| A10 | New parcel → order | Ticket with “Parcel” and no table |
| A11 | Move a seated visit | Source frees, target takes the state and ticket |
| A12 | Airplane mode mid-order → send → reconnect | One queued order, one ticket, no duplicate |
| A13 | Cameras tab | Annotated JPEG; offline notice when vision stops |
| A14 | Install over HTTPS on a phone | Standalone icon, no browser chrome |

### Reception/billing verification (Phase 4)

| # | Do this | Expect |
|---|---|---|
| B1 | Waiter seats G3 and orders; reception opens G3 | Sequential `DS-<year>-0000xx` number, exact items |
| B2 | Add two waters and a 10% discount | Extras/discount update the totals |
| B3 | Set 5% exclusive tax (settings) and reopen the bill | CGST/SGST split, round-off line |
| B4 | Pay cash ₹112 + UPI ₹100 (hand example) | PAID, change/rounding correct |
| B5 | Check the waiter board | G3 becomes needs_cleaning with a cleaning task |
| B6 | Print 80 mm and A4 | Bill number, items, tax, total, GSTIN, footer |
| B7 | Void an open bill with a reason | VOID; number retained; table free |
| B8 | Admin reopens a paid bill | OPEN; payments reversed and audited; bill requested |
| B9 | Void an item after Start with a reason | Item struck off, totals recalculated |
| B10 | Reception list | Running totals + bill-request/escalation flags |

### Admin verification (Phase 5)

| # | Do this | Expect |
|---|---|---|
| C1 | Admin password login | Lands on `/admin` |
| C2 | Change the decision window to 240s | Saved; a newly seated table gets a 240s countdown |
| C3 | Add a floor/table; check the waiter board; remove it | Table appears/disappears without SQL |
| C4 | Add a waiter with PIN `4321`; sign in; deactivate | PIN works; deactivated login fails |
| C5 | Import a CSV with ground + AC prices | Item/variants/prices appear; both floors correct |
| C6 | Import a row with one blank floor price | Warning in preview; variant unavailable on that floor |
| C7 | Overview vs a hand-summed set of bills | Earnings/bills/items and splits match |
| C8 | Export CSV | Item rows with bill number, totals and payments |
| C9 | Set tax 5% exclusive in Settings; print a bill | CGST/SGST/round-off on the bill |
| C10 | Try a 1s decision window / a 2-digit PIN | Both rejected with a clear message |

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

## API surface (Phases 1–5)

- `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET /api/snapshot` · `GET /api/stream` (SSE, role-filtered)
- `GET /api/tables` · `POST /api/tables/:id/state` · `POST /api/tables/:id/vision-mute`
- `POST /api/orders` (waiter/receptionist/admin, `clientKey` idempotent)
- `POST /api/tasks/:id/action` (`ack` · `snooze` · `done`)
- `POST /api/vision/events` · `POST /api/vision/heartbeat` · `GET /api/vision/config`
- `GET /api/health` (DB, worker heartbeat, camera status)
- Menu/kitchen: `GET /api/menu` · `GET /api/menu/stock` ·
  `POST /api/menu-variants/:id/availability` · `GET /api/kitchen/tickets`
- Order lifecycle: `POST /api/orders/:id/start|ready|served` ·
  `POST /api/order-items/:id/cancel` · `GET /api/order-context`
- Visits: `POST /api/sessions` (takeaway) · `POST /api/sessions/:id/request-bill` ·
  `POST /api/sessions/:id/move` · `POST /api/sessions/:id/served` ·
  `GET /api/camera/:id/snapshot.jpg` (staff proxy)
- Billing: `GET /api/bills/open` · `GET /api/bills/:sessionId` ·
  `POST /api/bills/:sessionId/adjustments` (add/remove) ·
  `POST /api/bills/:sessionId/pay` · `POST /api/bills/:sessionId/void` ·
  `POST /api/bills/:sessionId/reopen` (admin)
- Admin: `GET/POST/PATCH/DELETE /api/admin/menu` · `PUT /api/admin/menu/prices` ·
  `POST /api/admin/menu/import/preview` · `POST /api/admin/menu/import` ·
  `GET/POST/PATCH/DELETE /api/admin/floors` · `GET/POST/PATCH /api/admin/staff` ·
  `GET/PUT /api/admin/settings` · `PUT /api/admin/restaurant`
- Reports: `GET /api/reports/summary?preset|from&to` ·
  `GET /api/reports/export.csv?preset|from&to`
- Vision service (inside the LAN / bound to 127.0.0.1: `8100`): `GET /health`,
  `GET /snapshot/{camera_id}.jpg`
- Dev-only: `POST /api/dev/simulate` · `POST /api/dev/order` · `POST /api/dev/time-skip` · `GET /api/dev/events`

## Assumptions and defaults (Phases 1–5)

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
- **Takeaway prices** use the first zone by sort (Ground Floor, non-AC) unless a
  zone is supplied. There is no floor picker in the parcel flow yet.
- **Stock** is per variant across both floors; marking a variant out of stock makes
  it unavailable on every floor. The chef board also lists beverages.
- **Serving:** a ticket can be served from the kitchen once READY; when every
  non-cancelled ticket in the visit is SERVED, the table moves to Dining. A
  food-ready task stays until all tickets are served.
- **Cancellations:** waiters may cancel items only while the ticket is still
  `PLACED`; after cooking starts only reception/admin can, with a written reason.
  A fully cancelled ticket is marked `CANCELLED` and stays red on the chef board for
  two minutes.
- **HTTPS:** Caddy uses its internal CA by default (`SITE_ADDRESS`, default
  `localhost`). Install `caddy-root.crt` on devices; set `COOKIE_SECURE=true` for
  real HTTPS installs. Do not delete the `caddy-data` volume afterwards.
- **Offline queue:** pending orders live in `localStorage`; they retry on `online`,
  every 5 s while the board is open, and whenever the order page reloads. `clientKey`
  makes retries idempotent.
- **Service worker:** network-first for navigations, cache-first for static assets,
  and it never caches `/api/` responses (stale table state is dangerous).
- **E2E coverage:** the two-device flow uses two browser contexts and Chromium
  offline mode, not physical phones; the camera tab depends on the vision service
  (demo videos in this repo).
- **Bill numbers** are allocated on the first time a bill is opened (not when the
  visit starts) from a per-year `BillCounter`, formatted `DS-<year>-<6 digits>`.
  Voided bills keep their number; the counter never goes backwards.
- **Tax** defaults to 0/exclusive. Settings: `TAX_RATE_PERCENT` (0–100) and
  `TAX_MODE` (`exclusive`/`inclusive`). Inclusive bills keep the customer total and
  extract the tax; CGST is the floor half and SGST the remainder.
- **Discounts:** percent discounts apply to the item subtotal and are recomputed if
  items change; fixed discounts are stored in paise. Extras/discounts are audited.
- **Payments:** PAID when the sum of split payments is at least the total; change is
  displayed. A paid visit closes and the table goes to needs_cleaning.
- **Voids/reopen:** void only for OPEN bills (reception/admin, reason required) and
  frees the table; reopen is admin-only for PAID bills, reverses the recorded
  payments (kept in the audit log), reopens the visit and asks for the bill again.
  Reopen is refused if the table has been reseated.
- **Printing:** browser print with 80 mm/A4 CSS layouts; no ESC/POS integration in
  v1. Verify the paper layout on the owner's printer at handover.
- **Reception list** includes every open visit, including tables with no orders;
  takeaway bills appear as “Parcel” with no table.
- **Reports:** earnings/bills come from PAID bills by `paidAt`; orders/items come
  from non-cancelled orders by `placedAt`; dish totals use snapshotted item prices.
  Payment-method sums are the recorded payments (change from overpayment is not
  netted). Ranges are business dates in IST with the configurable cutoff.
- **Menu import:** prices in the file are rupees and become integer paise; blank
  prices create/keep an unavailable price on that floor and show a warning; re-import
  upserts by category/item/variant (case-insensitive). Variants with order history
  cannot be deleted; items with history are archived.
- **Floors/tables:** a floor can only be deleted when it has no tables, cameras,
  prices, visits or tasks; tables with history are archived instead of deleted.
  Cameras are read-only in Phase 5 (assignment only); camera add/test/calibration is
  Phase 6.
- **Staff:** admin accounts need a password (6+); staff use a 4–6 digit PIN; PINs and
  passwords are hashed. The owner cannot deactivate their own account. Staff PINs
  are not required to be globally unique (login checks each active hash); keep them
  distinct in practice.
- **Settings bounds:** decision 30–3600s, snooze 30–3600s, ticket timers up to 4h,
  tax 0–100%, business day `HH:mm`, bill prefix 1–8 alphanumerics. Invalid values
  are rejected, not silently clamped.
- **Dependency:** `exceljs` is used only server-side to read XLSX imports; CSV uses
  the tested pure parser. It adds ~189 transitive packages to the web image; remove
  it if XLSX support is dropped.
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

Phase 6 camera calibration/admin review, Phase 7 productization.
