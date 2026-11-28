# DineSense

Local-first restaurant operations for **The Chinese Chef**: table alerts, waiter ordering, kitchen tickets, reception billing and an owner dashboard. The mini PC runs everything on the restaurant Wi-Fi.

Service needs no cloud account. When the LAN goes down, queued waiter orders sync after devices reconnect.

> **Shipped install**
> Restaurant: **The Chinese Chef** · Wi-Fi: **The Chinese Chef** · Server: `http://192.168.1.43`
> Reserve `.43` on the router. Android package (APK): `dist/DineSense.apk` (`1.2.0`, build `3`).

## Contents

- [What it does](#what-it-does)
- [Get running](#get-running)
- [Verified state](#verified-state)
- [Daily service flow](#daily-service-flow)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Menu data](#menu-data)
- [Developer setup](#developer-setup)
- [Testing](#testing)
- [Operations](#operations)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Roadmap](#roadmap)

## What it does

| Role | Device | What they do |
|---|---|---|
| **Waiter** | Phone | Seat and manage tables, see “next up” alerts, take orders with correct air-conditioned (AC) or non-AC prices, mark food served, request bills, take parcels |
| **Chef** | Tablet | New → Preparing → Ready board, oldest first, age timers, by-dish view, out-of-stock toggles, chimes and wake lock |
| **Reception** | Desktop | Settle bills, apply extras and discounts, void items, split cash/UPI/card, print 80 mm/A4 receipts, void or reopen with audit |
| **Owner** | Desktop/phone | Manage menu, floors, tables, staff, timers, tax, UPI, daily cash close, reports, cameras, health, backups and pilot review |

**Core rule:** when someone seats a table, the system stores a 120-second deadline in Postgres. If no order exists when it expires, the worker raises a priority waiter task. Camera events never auto-free ordered or unpaid visits.

**Billing:** Goods and Services Tax (GST) per category or dish, Harmonized System of Nomenclature (HSN) on items, service charge, inclusive/exclusive tax, round-off, Food Safety and Standards Authority of India (FSSAI) details, generated Unified Payments Interface (UPI) QR or uploaded shop QR, manual payment confirmation, cash close variance and a GST report. Service needs no cloud account.

## Get running

### 1. Install on the mini PC

Requirements: Ubuntu 22.04/24.04, 4+ cores, 8 GB RAM, wired LAN, DHCP reservation for the mini PC. See [docs/HARDWARE.md](docs/HARDWARE.md).

```bash
git clone https://github.com/vishweshpenkar06/DineSense.git /opt/dinesense
cd /opt/dinesense
sudo ./install.sh
```

The installer installs Docker if needed, creates private secrets in `.env`, builds and starts the stack, seeds the minimal database, prints the admin password and URLs, exports the certificate authority (CA), and schedules nightly backups.

### 2. Set up the restaurant

1. Open `http://192.168.1.43/setup`. Use the HTTPS URL from a device that trusts the CA.
2. Sign in with the **Admin password** printed by the installer or stored in `.env`.
3. Complete the wizard: restaurant profile, floors/tables, cameras, menu import, staff, timers/tax, guided test, finish.
4. Create staff PINs in **Admin → Staff** if the wizard did not create them.
5. Import the live card from **Admin → Menu → Choose file → Preview → Import** using `data/menu-chinese-chef.csv`.

`.env` is private and git-ignored. Never commit it or paste it into issues or chat.

### 3. Put the apps on staff devices

Android, recommended for waiters:

```bash
adb install -r dist/DineSense.apk
```

Connect the phone to Wi-Fi **The Chinese Chef**. The setup screen shows the Wi-Fi name and pre-fills `http://192.168.1.43`. The native app needs no HTTPS certificate.

Progressive web app (PWA), optional:

- Install the CA from `http://192.168.1.43/ca.crt` or `caddy-root.crt`.
- Use `https://192.168.1.43`. HTTPS enables browser notifications and PWA install.
- On plain HTTP the app still works. Sound, vibration and native APK alerts still work.

### 4. Open a role screen

| Screen | URL |
|---|---|
| Waiter | `/waiter` |
| Chef | `/chef` |
| Reception | `/reception` |
| Owner/admin | `/admin` |
| Setup | `/setup` |
| Dev console, builders only | `/dev` when `ENABLE_DEV_CONSOLE=true` |

Demo defaults (`admin123`, `1111`, `2222`, `3333`) apply only when the matching `SEED_*` variables are absent. The shipped install uses the private values in `.env`.

## Verified state

| Check | Result |
|---|---|
| Typecheck | clean |
| Core domain (`npm run test:core`) | **121/121** |
| Database acceptance (`npm run acceptance`) | **122/122** |
| Vision service (`pytest`) | **36/36** |
| Playwright (`npm run test:e2e`) | **9/9** |
| Production smoke | health `200`, role checks `403`, dev routes `404`, HTTPS with CA `200` |

The 120-item AC/non-AC menu imports with 235 variants and 470 floor prices, zero errors and zero warnings. The APK is signed and was smoke-tested in an Android 15 emulator. Physical printers, real Real Time Streaming Protocol (RTSP) cameras and physical phones remain on-site handover checks.

## Daily service flow

1. The waiter seats a table or confirms a camera detection.
2. The 120-second decision timer creates a “waiting to order” alert if needed.
3. The waiter sends the order to the kitchen with the correct floor prices and variants.
4. The chef starts and finishes tickets. Food-ready alerts outrank older tasks.
5. The waiter marks food served, then requests the bill.
6. Reception applies extras and discounts, settles cash/UPI/card, prints the bill and closes the visit.
7. The owner reviews reports, cash close and health at the end of the day.

Offline orders are stored locally with an idempotency key. The app sends each order exactly once after the phone reconnects.

## Architecture

```text
RTSP cameras or demo video ──► vision (FastAPI, YOLO11n, ByteTrack)
                               │ table events and heartbeats (shared secret)
                               ▼
Staff phones and tablet ◄──► Caddy (80/443) ◄──► web (Next.js UI, API, SSE)
                                                   │
                                                PostgreSQL 16
                                                   │
                                             worker (timers, tasks, health)
```

- **Local-first:** the mini PC runs everything. Service needs no internet connection.
- **Realtime:** server-sent events (SSE) and Postgres `LISTEN/NOTIFY` push changes. Clients resync through `/api/snapshot`.
- **Restart-safe:** sessions, deadlines, tasks and bills live in Postgres.
- **Private:** the system AES-GCM-encrypts RTSP credentials at rest. Video stays in memory, and only table states and counts reach staff screens.

### Repository layout

```text
apps/web          Next.js App Router: all roles, API, SSE and print layouts
apps/android      Native WebView shell: Wi-Fi setup, shortcuts, pickup alerts, print
apps/worker       Timers, abandonment, task alerts, camera health
packages/core     Pure domain logic: state machine, bills, dates, settings
packages/db       Prisma schema, migrations, seed and DB services
services/vision   FastAPI detector, calibration, demo generator and tests
e2e               Playwright device, order, billing, admin, camera and setup suites
docs              Install, hardware, HTTPS, pilot, APK and role guides
data              menu-chinese-chef.csv, the live AC/non-AC card
scripts           Install, backup, restore, update, health, diagnostics, APK build
install.sh        One-command Ubuntu mini PC installer
```

## Configuration

Copy [.env.example](.env.example) to `.env` and set real values. Keep `.env` private.

| Variable | Purpose | Shipped value or default |
|---|---|---|
| `SITE_ADDRESS` | Caddy host and certificate name | `192.168.1.43` (reserve this IP) |
| `COOKIE_SECURE` | Secure cookie flag | `false` for LAN HTTP |
| `DEMO_ALLOW_ALL_ROLES` | Bypass role checks for review | `false` |
| `ENABLE_DEV_CONSOLE` | `/dev` and `/api/dev/*` | `false` |
| `NEXT_PUBLIC_ENABLE_DEV_UI` | Dev UI links in admin | `false` |
| `VISION_DEMO` | Use generated demo videos | `false` (real cameras or manual seating) |
| `SESSION_SECRET` | JSON Web Token (JWT) signing secret | random in `.env` |
| `ENCRYPTION_KEY` | RTSP credential encryption | random in `.env` |
| `VISION_SHARED_SECRET` | Web and vision authentication | random in `.env` |
| `SEED_ADMIN_PASSWORD` | Initial admin password | random/private |
| `SEED_WAITER_PIN`, `SEED_CHEF_PIN`, `SEED_RECEPTIONIST_PIN` | Seed staff PINs | private; change later in Admin → Staff |

Business defaults: decision timer **120 s**, business day starts **05:00 IST**, money uses integer paise, tax starts **0/exclusive**, service charge **0%**, bill numbers follow `DS-YYYY-NNNNNN`. Edit these in **Admin → Settings**.

## Menu data

`data/menu-chinese-chef.csv` is the source of truth for the live dine-in card.

| Metric | Value |
|---|---:|
| Items / sections | 120 / 9 |
| Variants | 235 |
| Floor prices | 470 |
| Import errors | 0 |

Ground Floor uses the non-AC card. First Floor uses the AC card. Half/Full, Dry/Gravy and slash-priced rice/noodle variants stay intact. The original 93 Zomato-priced items are archived, not deleted, so historical bills remain intact. Import from **Admin → Menu** instead of editing the database directly.

## Developer setup

```bash
npm install
cp .env.example .env
docker compose up -d --build
docker compose run --rm migrate npm run db:seed -w @dinesense/db
```

Local development scripts:

```bash
npm run dev:web
npm run dev:worker
npm run typecheck
npm run test:core
npm run build
```

When the mini PC IP changes, update `SITE_ADDRESS` and the Android `DEFAULT_SERVER_URL`. Rebuild the APK with `./scripts/build-android.sh` and renew the Caddy certificate.

## Testing

```bash
npm run typecheck
npm test
npm run test:core
npm run acceptance
npm run test:e2e
docker compose run --rm --no-deps vision pytest
```

`npm test` runs the new DB and web unit suites, including the scratch-DB guard test and the API authentication coverage test.

`npm run acceptance` needs a migrated and seeded scratch database. It refuses any `DATABASE_URL` whose database name is not explicitly scratch, acceptance or test. Never run it against the live database.

`npm run test:e2e` needs the dev stack with `ENABLE_DEV_CONSOLE=true` because tests use `/api/dev/reset`. The shipped stack keeps dev routes disabled. Set `E2E_ADMIN_PASSWORD`, `E2E_WAITER_PIN`, `E2E_CHEF_PIN` and `E2E_RECEPTIONIST_PIN` before running it; there are no credential defaults.

The acceptance suite verifies billing to the paisa, timers and restarts, split payments, void and reopen, reports against raw bills, menu import, camera calibration, setup and pilot flows. Playwright covers two-device ordering, offline exactly-once sync, reception printing, admin configuration, cameras, setup and screenshots.

## Operations

```bash
docker compose ps
docker compose logs -f web worker
./scripts/healthcheck.sh
./scripts/backup.sh
./scripts/restore.sh backups/your_backup_file
./scripts/update.sh
./scripts/diagnostics.sh
./scripts/lan-ip.sh
./scripts/export-ca.sh
./scripts/build-android.sh
```

- Backups run nightly at 03:00 with 14-day retention. Configure an optional USB or rclone offsite target.
- **Admin → Health** shows database, worker tick, disk, backup age, clock and camera status.
- Updates roll back automatically when the post-update health check fails.
- Power cuts are safe. Docker restarts services and the worker catches up on timers.

## API surface

Key application programming interface (API) route groups:

- **Auth:** `/api/auth/login|logout|me`
- **Realtime:** `/api/snapshot`, `/api/stream`
- **Floor and orders:** `/api/tables`, `/api/orders`, `/api/tasks`, `/api/sessions`, `/api/menu`
- **Kitchen:** `/api/kitchen/tickets`, `/api/order-items`, `/api/menu-variants`
- **Billing:** `/api/bills/open`, `/api/bills/:sessionId`, `/api/bills/:sessionId/adjustments|pay|void|reopen`
- **Admin:** `/api/admin/*`, `/api/reports/summary`, `/api/reports/export.csv`
- **Vision:** `/api/vision/*` through the web proxy, `http://vision:8100` for the service only
- **Health:** `/api/health`

Dev-only routes under `/api/dev/*` return `404` when `ENABLE_DEV_CONSOLE=false`.

## Troubleshooting

| Symptom | Check |
|---|---|
| Android says “could not reach server” | Phone is on Wi-Fi **The Chinese Chef**. Server is `http://192.168.1.43`. The router reserves `.43`. Rebuild the APK if the IP changed. |
| Staff cannot open another role screen | Demo bypass is off. Sign in with that role's own PIN. |
| Browser notifications unavailable | Use the native APK, or install the CA and open the HTTPS URL. |
| Camera shows offline | Expected until real RTSP cameras are configured. Manual seating still works. |
| Bill shows wrong restaurant name | Open Admin → Settings → Restaurant profile. |
| Admin API returns `403` | Sign out and use the correct account. |
| `/dev` or `/api/dev/*` returns `404` | The shipped install disables the dev console. |
| HTTPS certificate warning on PWA | Install `caddy-root.crt` or `http://192.168.1.43/ca.crt` on that device. |

## Documentation

- [Install guide](docs/INSTALL.md)
- [Hardware and network](docs/HARDWARE.md)
- [HTTPS and CA setup](docs/HTTPS.md)
- [Android APK](docs/APK.md)
- [Pilot and handover](docs/PILOT.md)
- [Waiter](docs/QUICK-WAITER.md), [Chef](docs/QUICK-CHEF.md), [Reception](docs/QUICK-RECEPTION.md), [Admin](docs/QUICK-ADMIN.md)
- [UI redesign plan](docs/UI-REDESIGN.md)
- [Product roadmap](docs/PRODUCT-ROADMAP.md)
- [Product requirements](DineSense_Masterplan_v2.md)

## Roadmap

Shipped now: table and task engine, optional camera integration, four staff roles, complete menu, GST/UPI billing, cash close, reports, onboarding, backups, health diagnostics, signed native APK and pilot tooling.

Not in this release: inventory and recipes, loyalty and CRM, reservations, customer QR ordering, payment gateway, delivery aggregator APIs, ESC/POS printer service, multi-outlet cloud, licensing and fleet dashboard, and the U1–U7 UI screen migration.

Handover still requires on-site checks with the real Wi-Fi, phones, printer and cameras.
