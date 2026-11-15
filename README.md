# DineSense

Local-first restaurant operations for a small two-floor Indo-Chinese restaurant.
One mini PC, no internet required, phones on the LAN.

**Status: Phase 1 — Core Engine.** The table state machine, the 3-minute decision
timer, waiter tasks, vision event ingestion, SSE realtime and the dev console are
built and tested. Waiter/chef/reception/admin product screens, the Python vision
pipeline, billing and the setup wizard are later phases.

---

## What Phase 1 does

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
- Docker Compose: Postgres 16, migrations, web, worker, Caddy placeholder.

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

---

## Repository layout

```
apps/web          Next.js 15 App Router (UI + API + SSE)
apps/worker       Node worker: timers, abandonment, task alerts
packages/core     Pure TypeScript domain logic + Vitest tests
packages/db       Prisma schema/migrations/seed + DB services (engine, jobs, orders)
services/vision   Phase 2 Python service placeholder
deploy/Caddyfile  Phase 1 reverse-proxy placeholder
docker-compose.yml
```

## Quick start (Docker Compose)

Requires Docker with the Compose plugin (x86/ARM mini PC, Ubuntu).

```bash
cp .env.example .env        # edit secrets before real use
docker compose up -d --build
docker compose run --rm migrate npm run db:seed -w @dinesense/db
```

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

## API surface (Phase 1)

- `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET /api/snapshot` · `GET /api/stream` (SSE, role-filtered)
- `GET /api/tables` · `POST /api/tables/:id/state` · `POST /api/tables/:id/vision-mute`
- `POST /api/orders` (waiter/receptionist/admin, `clientKey` idempotent)
- `POST /api/tasks/:id/action` (`ack` · `snooze` · `done`)
- `POST /api/vision/events` · `POST /api/vision/heartbeat` · `GET /api/vision/config`
- `GET /api/health` (DB, worker heartbeat, camera status)
- Dev-only: `POST /api/dev/simulate` · `POST /api/dev/order` · `POST /api/dev/time-skip` · `GET /api/dev/events`

## Phase 1 assumptions (documented defaults)

- **Vision debounce lives in the vision service** (Phase 2), so an incoming
  `occupied`/`empty` event is treated as already confirmed. The app additionally
  waits `EMPTY_CONFIRM_S` on an empty reading before abandoning an unordered visit,
  which is the safe bias required by the masterplan. A real camera therefore frees an
  abandoned table in ~120s; staff can override at any time.
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

Phase 2 vision pipeline, Phase 3 waiter/chef PWAs + HTTPS, Phase 4 billing,
Phase 5 admin, Phase 6 calibration, Phase 7 productization.
