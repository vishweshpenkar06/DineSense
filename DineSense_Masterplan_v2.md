# DineSense — Product Masterplan (v2)

> This is a **real product that will be sold and installed in a real restaurant**, not a demo. Everything below exists because the software must work on a busy Saturday night with bad Wi-Fi, a stressed waiter, and an owner who is not technical.

> **Shipped note:** the installed build is branded **The Chinese Chef**, runs at `http://192.168.1.43` on Wi-Fi **The Chinese Chef**, and uses the native APK without a CA. GST/UPI/day close are shipped; see `README.md` for current status. This document remains the original requirements source.

---

## 0. Instructions to the AI coding agent (read first)

1. Read §1–§7 once for context. Then build **only the phase the user names** (§16), reading only the sections that phase lists. Do not build ahead.
2. **Framework first.** Phases 1–2 build the engine (table states, 2-minute timer, tasks, realtime, camera detection). Nothing else is built on top until those pass their acceptance tests.
3. Every phase ends with: it runs with `docker compose up`, typecheck + tests pass, a short README note on what was added, one git commit. Then report in ≤10 lines: what works, what you could not do, what to test by hand.
4. If a requirement here is ambiguous, use the **default given in §19** and note the assumption in your report. Do not stop to ask unless it blocks the phase.
5. Never hardcode restaurant-specific values (tax, prices, names, timers, table counts). They live in the database/settings.
6. Money is **integer paise**. Timestamps are stored in UTC; displayed in `Asia/Kolkata`.
7. Keep business logic in pure, unit-tested functions (state machine, timers, billing, priority). UI and routes call them; they never re-implement them.
8. Prefer boring, reliable choices. Minimal diffs. No new dependency without a one-line reason in the README.

---

## 1. The Product (what we are selling)

**Customer:** a small Chinese restaurant (owner is a friend of the builder) with **one waiter, one chef, one receptionist/cashier, and an owner/admin**.

**Layout:** two floors.

| Zone | Tables | Notes |
|---|---|---|
| Ground floor | 5 | Non-AC (fans). Cheaper menu prices |
| First floor | 6 | AC. Menu prices are higher because of AC charges |

**The problems we solve**
1. One waiter cannot watch 11 tables on two floors. Customers sit and wait; nobody notices.
2. Orders are written on paper and carried to the chef — slow, illegible, lost.
3. The chef cannot see everything pending at once.
4. The receptionist calculates bills by hand (different AC/non-AC prices, extras like water bottles).
5. The owner has no numbers: earnings, what sells, busy hours.

**What the system does (one paragraph):** Cameras (the restaurant's CCTV) watch the tables. When a table becomes occupied, a **2-minute timer** starts. If nobody has taken that table's order when the 2 minutes end, the waiter's app shows a clear alert: *"Table 7 (First Floor) is waiting to order."* The waiter goes, takes the order, and **taps it into the app** instead of writing on paper. The chef's screen shows it instantly. When the food is ready the waiter is told. The receptionist sees each table's running bill (with AC/non-AC prices and extras like water bottles) and closes it. The owner sees total earnings and total food ordered for any day or date range.

**Success looks like (owner's view):** the waiter stops forgetting tables, paper chits disappear, the chef never asks "what's pending?", bills are right the first time, and the owner can see yesterday's sales in ten seconds.

---

## 2. Real-World Context the Agent Must Respect

| Reality | What it means for the software |
|---|---|
| Staff are not tech-savvy, often hands-busy | Huge buttons, few words, color + icon, almost no typing. Waiter orders in ≤ 6 taps for a typical 3-item order |
| Rush hour: dozens of events in minutes | Waiter sees **one "Next up" task**, not a flood. Chef sees oldest tickets first |
| Restaurant Wi-Fi drops; internet can be down | The whole system runs **on a local mini PC inside the restaurant**. It must work with **zero internet** |
| Power cuts happen | Everything restarts by itself on boot; no data loss; timers survive restarts (deadlines stored in DB) |
| Waiter's phone is the only waiter device | Keep screen on while app is open; alerts = in-app banner + loud sound + vibration |
| Cameras are existing or cheap IP/CCTV (RTSP) | Vision must tolerate reconnects, bad angles, people blocking each other |
| Menu is Indo-Chinese: Half/Full plates, Dry/Gravy, veg/non-veg, spice levels | Menu model needs variants and notes. Item names must support Devanagari text |
| Many parcels/takeaways | A takeaway order (no table) must be possible |
| Restaurants close after midnight | "Business day" cutoff is configurable (default 05:00), so late-night sales count for the right day |
| Customers/staff are filmed | Video never leaves the restaurant, is never stored by default |

The apps are installed to the phone/tablet home screen (**PWA**, full-screen, own icon) so they feel like real apps. Native Android/iOS apps are not in v1.

---

## 3. Fixed Requirements (non-negotiable)

1. **Decision timer = 2 minutes (120 seconds)**, counted from the moment a table is confirmed **occupied**. Stored as setting `DECIDE_WINDOW_S`, default **120**. Admin may change it; the default must be 120.
2. Four roles: **waiter, chef, receptionist, admin**.
3. Camera detects per table: **free / occupied**. The waiter app can show the **live camera view**.
4. When the timer ends and no order exists → waiter gets an in-app alert **"Table X is waiting to order"** (not an OS push notification).
5. Waiter takes orders by **tapping items in the app** and picking the table; chef sees the order **live**.
6. Menu prices **differ by zone** (ground non-AC vs first-floor AC). The waiter always sees the correct price for that table's floor.
7. Receptionist sees each table's order and an **automatic bill**, including extras (water bottles etc.) and manual additions.
8. Admin sees **total earnings and total food ordered** for a day or any date range.
9. Works fully offline on the restaurant LAN.
10. All timers/alerts are driven by the **server**, never by a browser.
11. Manual override always exists: the waiter can set any table's state by hand if the camera is wrong.

---

## 4. Architecture (local-first, one mini PC at the restaurant)

```
 CCTV cameras (RTSP) ──► [vision] Python: YOLO11n + tracking + debounce
                              │  POST table events / heartbeats (shared secret)
                              ▼
 Phones/tablets/PC ◄──► [caddy HTTPS] ◄──► [web] Next.js (UI + API + SSE realtime)
                                               │
                              [worker] Node: timers, task engine, escalation, backups trigger
                                               │
                                          [db] PostgreSQL 16
```

All five run with **Docker Compose** on one mini PC (`restart: unless-stopped`, auto-start on boot).

| Piece | Choice | Why the agent should do it this way |
|---|---|---|
| Web app | **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** | One codebase for all four roles |
| DB | **PostgreSQL 16 + Prisma** | Reliable, local, owner keeps his data. No cloud dependency |
| Auth | Own cookie sessions (JWT), **PIN login for staff**, password for admin | Waiters can't type long passwords |
| Realtime | **Server-Sent Events** fed by Postgres `LISTEN/NOTIFY` | Simple, survives reconnects. On reconnect the client refetches a full snapshot |
| Worker | Separate Node TypeScript process | Timers must run even if no screen is open |
| Vision | **Python 3.11, Ultralytics YOLO11n, ByteTrack (Ultralytics), OpenCV, FastAPI** (snapshot + health) | Proven person detection; CPU-friendly |
| HTTPS | **Caddy** reverse proxy | PWA install, service worker, wake lock and vibration need a secure context. Plain `http://192.168.x.x` will NOT work for these |
| Tests | Vitest (TS), pytest (Python pure logic) | Cheap, catches the expensive bugs |

**HTTPS on the LAN (the agent must solve this, it is a real blocker):**
- Preferred: a real domain with an A record pointing to the mini PC's LAN IP and Caddy using DNS-challenge certificates (trusted by all phones, nothing to install).
- Fallback: Caddy's internal CA + a local hostname (e.g. `dinesense.local`); provide a doc with steps to install the root certificate on Android/iOS/Windows.
- Disable response buffering for the SSE route.

**Camera credentials** (RTSP URLs with passwords) live only in the vision service config/DB-encrypted field and are **never sent to browsers**.

**Services contract summary**
- `vision → web`: `POST /api/vision/events`, `POST /api/vision/heartbeat`, `GET /api/vision/config` (all with `Authorization: Bearer $VISION_SHARED_SECRET`).
- `browser → vision (via web proxy)`: `GET /api/camera/:id/snapshot.jpg` — the web app proxies the vision snapshot so browsers never talk to the vision service directly.

---

## 5. Core Workflow (end to end)

```
1. Customers sit at Table 7 (First Floor).
2. Vision sees a person in Table 7's zone continuously for SEATED_CONFIRM_S (20 s)
   → sends event: occupied.
3. App opens a SESSION for Table 7, table state = OCCUPIED.
   decision_deadline = occupied_at + 120 s.        ← the 2-minute timer
4. Waiter's Table board shows Table 7 amber with a visible countdown.
5. If an order for Table 7 is placed before 120 s → timer cancelled, no alert.
   Otherwise, at 120 s the WORKER:
     - table state = NEEDS_ORDER
     - creates task "Table 7 is waiting to order" (priority 2)
     - waiter app: banner + loud sound + vibration
6. Waiter taps ACKNOWLEDGE (or SNOOZE 5 min), goes to the table,
   offers water, takes the order.
7. Waiter opens Table 7 → taps items (Half/Full, qty, note) → SEND TO KITCHEN.
   Order = a numbered ticket (KOT). Table state = ORDERED.
8. Chef screen: new ticket + chime → START (preparing) → READY.
9. READY creates task "Table 7 food is ready — pick up" (priority 1, highest).
   Waiter serves → taps SERVED. Table state = DINING.
10. Customers ask for bill → waiter taps REQUEST BILL → receptionist is alerted.
    (Receptionist can also open any table's bill herself.)
11. Receptionist adds extras (water bottle, etc.), discount if any, takes payment
    (cash / UPI / card, split allowed), PAID. Session closed.
12. Customers leave: vision sees the table empty for EMPTY_CONFIRM_S (60 s)
    → table = NEEDS_CLEANING → waiter taps CLEANED → FREE.
```

Extra orders during the same visit → new tickets on the same session. A table is **never freed by the camera while its bill is unpaid**.

---

## 6. Table & Session State Machine

A **session** = one party's visit (`dine_in` at a table, or `takeaway` with no table). A **table** shows the state of its active session (or `free`).

### 6.1 States
| State | Meaning | Color |
|---|---|---|
| `free` | No session | Green |
| `occupied` | Seated; 2-minute decision timer running | Amber + countdown |
| `needs_order` | Timer ended, no order yet; waiter alerted | Red, pulsing |
| `ordered` | Order sent; kitchen working | Blue |
| `food_ready` | Chef marked ready; waiting for pickup | Purple |
| `dining` | Everything served | Slate |
| `bill_requested` | Waiting for receptionist | Orange |
| `needs_cleaning` | Paid; customers gone | Grey |

### 6.2 Events
`VISION_OCCUPIED`, `VISION_EMPTY`, `TIMER_EXPIRED`, `ORDER_PLACED`, `ORDER_READY`, `ALL_SERVED`, `BILL_REQUESTED`, `BILL_PAID`, `CLEANED`, `MANUAL_SET(state)`, `VISION_MUTED/UNMUTED`.

### 6.3 Transition rules (implement exactly, with tests for each row)
| From | Event | To | Side effects |
|---|---|---|---|
| free | VISION_OCCUPIED | occupied | open session, set `decision_deadline = now + DECIDE_WINDOW_S` |
| needs_cleaning | VISION_OCCUPIED | occupied | auto-complete cleaning task, open new session |
| occupied | TIMER_EXPIRED | needs_order | create `needs_order` task |
| occupied / needs_order | ORDER_PLACED | ordered | cancel `needs_order` task, set `first_order_at` |
| ordered / dining / food_ready | ORDER_PLACED | (unchanged, or `ordered` if it was `dining`) | new ticket |
| ordered | ORDER_READY | food_ready | create `food_ready` task |
| food_ready | ALL_SERVED | dining | complete task |
| ordered/food_ready/dining | BILL_REQUESTED | bill_requested | create `bill_requested` task |
| any with open session | BILL_PAID | needs_cleaning | close session, create `clean_table` task |
| needs_cleaning | CLEANED | free | complete task |
| occupied/needs_order/ordered/food_ready/dining/bill_requested | VISION_EMPTY | **no change** | camera never ends an unpaid session |
| needs_cleaning/free | VISION_EMPTY | unchanged | — |
| any | MANUAL_SET | requested state | write audit log |

**Special case — empty with no order:** if a table is `occupied` or `needs_order` with **no order ever placed** and vision reports empty for `EMPTY_CONFIRM_S`, the party left without ordering → close the session as `abandoned` and set the table to `free` (cancel the task). Log it.

**Invariants:** one active session per table; never two open `needs_order` tasks for one session; state changes are idempotent (the same event twice causes no duplicate tasks).

---

## 7. Timer & Task Engine (the heart of the product)

### 7.1 The 2-minute rule
- `DECIDE_WINDOW_S = 120` (setting). Counted from the instant the table becomes `occupied`.
- The deadline is stored on the session. The **worker** checks every 5 seconds: `occupied` sessions with `now ≥ decision_deadline` and zero orders → fire `TIMER_EXPIRED`. Tolerance ±5 s.
- Restart-safe: after a worker/server restart it processes all overdue deadlines immediately (no lost alerts, no duplicates).
- Clients show a countdown computed from the stored deadline (not their own clocks; use server time offset).

### 7.2 Tasks
| Type | Created when | Priority | Auto-completes when |
|---|---|---|---|
| `food_ready` | chef marks ready | 1 (highest) | waiter taps served |
| `needs_order` | 2-minute timer ends | 2 | order placed (auto-cancel) or abandoned |
| `bill_requested` | waiter requests bill | 3 | bill finalized |
| `clean_table` | bill paid | 4 | CLEANED, or new party sits |
| `custom` | waiter/receptionist adds ("water", "extra plate") | 4 | done |

Ordering for the waiter's "Next up": priority ascending, then oldest first. **Floor-aware tie-break:** among equal priority, prefer the floor of the task the waiter last completed (saves stair trips).

### 7.3 Task actions & timing
- **Acknowledge** → stops the loud repeat for that task; it stays in the list until done.
- **Snooze** (`SNOOZE_S` = 300): hides the task and silences it; reappears after the snooze with a new alert. Use case: customers waiting for friends.
- **Unacknowledged repeat:** re-sound every `REALERT_S` = 60 s.
- **Escalation:** unacknowledged for `ALERT_ESCALATE_S` = 120 s → flagged red on the **receptionist** and **admin** screens ("Waiter hasn't responded: Table 7").
- **Vision mute:** the waiter can tap "Ignore camera for this table (5 min)" (e.g., while cleaning, so he is not detected as a customer). Auto-expires.

### 7.4 Settings (admin-editable, in DB)
| Key | Default |
|---|---|
| `DECIDE_WINDOW_S` | **120** |
| `SEATED_CONFIRM_S` | 20 |
| `EMPTY_CONFIRM_S` | 60 |
| `SNOOZE_S` | 300 |
| `REALERT_S` | 60 |
| `ALERT_ESCALATE_S` | 120 |
| `VISION_MUTE_S` | 300 |
| `TICKET_AMBER_S` / `TICKET_RED_S` | 600 / 1200 |
| `BUSINESS_DAY_START` | 05:00 |

---

## 8. Vision Service (the "seeing" part)

### 8.1 Job
For each configured camera, continuously decide for each assigned table whether **a person is sitting in its zone**, and report **only changes**.

### 8.2 Pipeline
```
RTSP substream (≈ 640–1280 px wide) or video file (dev/simulation)
 → sample ~3 FPS
 → YOLO11n, class "person" only
 → ByteTrack IDs
 → for each table polygon: count persons whose foot-point (bottom-centre of box) is inside the polygon
 → debouncer per table
 → POST event on change; POST heartbeat every 10 s
```

### 8.3 Table zones
- Polygons in **normalized coordinates (0–1)** per camera, drawn around the table **including its chairs**. Stored in the app DB (`dining_tables.zone_polygon`, `camera_id`); the vision service pulls them from `GET /api/vision/config` at start and every 60 s.
- A table belongs to exactly one camera. A camera may cover many tables.

### 8.4 Debouncing (most important logic; pure function + pytest)
- `occupied`: at least one person in zone for `SEATED_CONFIRM_S` (20 s) continuously, tolerating gaps ≤ 5 s.
- `empty`: zero persons for `EMPTY_CONFIRM_S` (60 s).
- Walking past never reaches 20 s, so it never triggers.
- Bias: when unsure, stay `occupied`. A false "free" is worse than a false "occupied".
- State is sent only on **change**, plus the full current state of all tables on service start (so the app resyncs).
- Respect `muted` tables (from `/api/vision/config`): don't emit while muted.

### 8.5 API contract
```
POST /api/vision/events
{ "camera_id": "uuid", "table_id": "uuid", "state": "occupied" | "empty",
  "person_count": 3, "confidence": 0.87, "ts": "2026-11-15T14:03:11Z",
  "event_id": "uuid" }                       // event_id makes retries idempotent

POST /api/vision/heartbeat
{ "camera_id": "uuid", "status": "ok" | "degraded" | "offline", "fps": 3.1, "ts": "..." }

GET /api/vision/config
→ { "settings": { "SEATED_CONFIRM_S": 20, "EMPTY_CONFIRM_S": 60 },
    "cameras": [ { "id", "name", "rtsp_url", "tables": [ { "id", "label", "polygon": [[x,y],...], "muted_until": null } ] } ] }
```
Vision → app calls retry with backoff if the app is down and never block detection.

### 8.6 Failure behaviour
- No heartbeat from a camera for 30 s → app marks it **offline**: waiter and receptionist see a banner "Camera offline — set tables manually". Tables stay in their last known state; manual override still works.
- Stream drops → reconnect with backoff; never crash.
- Mini PC overloaded → lower FPS automatically (min 1 FPS) and report `degraded`.

### 8.7 Live view for the waiter
- Vision serves an annotated JPEG (zone outlines + green/red per table) at ~1 FPS via `GET /snapshot/:camera_id.jpg`; the web app proxies it (§4). The waiter app has a "Cameras" screen with floor tabs. No video stored, no audio.

### 8.8 Dev & tuning tools (required)
- **Video-file mode:** run the same pipeline on a recorded clip for development and tests.
- **Event simulator** in the app's dev console (§16 Phase 1) to fake `occupied/empty` per table, so the whole app can be built and tested without any camera.
- **Tuning log:** CSV of per-table person counts and debounced state over time (no images) for the first week at the restaurant, to tune thresholds.
- **Performance targets (verify and report, do not assume):** ≥ 3 FPS per camera on the target mini PC CPU using YOLO11n (export to ONNX/OpenVINO if needed), up to 4 cameras, CPU < 70% average.

### 8.9 Privacy
Process on-site. Send only states and counts. Store no frames by default. Provide a plain-language notice text the owner can print ("This restaurant uses cameras for table management").

---

## 9. Data Model (PostgreSQL via Prisma)

> The agent finalizes exact Prisma models. UUID primary keys, `createdAt/updatedAt`. Money = integer paise.

```
User(id, name, role[ADMIN|RECEPTIONIST|WAITER|CHEF], pinHash?, passwordHash?, active)
Setting(key, value json)
RestaurantProfile(name, address, phone, gstin?, billFooter, logoUrl?)

Zone(id, name, isAc, surchargeType[NONE|FLAT|PERCENT], surchargeValue, sort)
DiningTable(id, zoneId, label, seats, state, cameraId?, zonePolygon json?, visionMutedUntil?, active)
Camera(id, name, zoneId, rtspUrlEncrypted, status, lastHeartbeatAt, fps)

Category(id, name, sort)
MenuItem(id, categoryId, name, nameLocal?, isVeg, needsKitchen, available, active, sort)
MenuVariant(id, itemId, label)                     // Half / Full / Regular / Dry / Gravy
VariantZonePrice(variantId, zoneId, pricePaise, available)   // PK (variantId, zoneId)

Session(id, kind[DINE_IN|TAKEAWAY], tableId?, state, openedBy[VISION|MANUAL],
        occupiedAt, decisionDeadline?, firstOrderAt?, closedAt?, closeReason[PAID|ABANDONED|VOID])
Order(id, sessionId, kotNumber, status[PLACED|PREPARING|READY|SERVED|CANCELLED],
      placedBy, note?, placedAt, preparingAt?, readyAt?, servedAt?, clientKey unique)   // clientKey = idempotency
OrderItem(id, orderId, variantId, nameSnapshot, variantSnapshot, qty, unitPricePaise,
          note?, cancelled, cancelReason?)

Bill(id, sessionId unique, billNumber, subtotal, extras, surcharge, discount, taxableAmount,
     cgst, sgst, roundOff, total, status[OPEN|PAID|VOID], finalizedBy?, paidAt?)
BillAdjustment(id, billId, kind[EXTRA|DISCOUNT], label, amountPaise)
Payment(id, billId, method[CASH|UPI|CARD], amountPaise, createdAt)

Task(id, type, tableId?, sessionId?, status[OPEN|ACK|SNOOZED|DONE|CANCELLED], priority,
     createdAt, ackAt?, snoozedUntil?, lastAlertAt?, doneAt?, escalatedAt?)
VisionEvent(id, eventId unique, cameraId, tableId, state, personCount, confidence, ts)   // pruned after 30 days
AuditLog(id, actorId?, action, entity, entityId, detail json, createdAt)
```

KOT numbers reset daily by **business day**. Bill numbers are sequential and never reused (§12).

---

## 10. Realtime & API Surface

**SSE:** `GET /api/stream` (cookie-authenticated, role-filtered). Event types: `table.updated`, `task.created|updated`, `order.created|updated`, `menu.availability`, `camera.status`, `bill.updated`. On every (re)connect the client first loads `GET /api/snapshot` (tables, open tasks, active orders) and then applies live events. Show a visible **"Live / Reconnecting…"** dot on every live screen.

**Main endpoints (role-guarded server-side):**
- Auth: `POST /api/auth/login` (PIN or password), `POST /api/auth/logout`, `GET /api/auth/me`
- Waiter: `GET /api/tables`, `POST /api/sessions` (manual open / takeaway), `POST /api/orders` (with `clientKey`), `POST /api/tasks/:id/ack|snooze|done`, `POST /api/tables/:id/state`, `POST /api/tables/:id/vision-mute`, `POST /api/sessions/:id/request-bill`, `POST /api/sessions/:id/move` (to another table)
- Chef: `GET /api/kitchen/tickets`, `POST /api/orders/:id/start|ready`, `POST /api/menu-variants/:id/availability`
- Reception: `GET /api/bills/open`, `POST /api/bills/:sessionId/adjustments`, `POST /api/bills/:sessionId/pay`, `POST /api/bills/:id/void` (admin)
- Admin: CRUD for menu/zones/tables/cameras/users/settings, `GET /api/reports/summary?from&to`, `GET /api/reports/export.csv`
- Vision: §8.5
- Health: `GET /api/health` (db, worker last tick, each camera status/fps, disk space, last backup)

All writes validate input server-side and write `AuditLog` for overrides, voids, discounts, cancellations after cooking started.

---

## 11. Screens by Role

### 11.1 Waiter (phone, portrait, one-handed)
1. **Next up** card (huge): task text, table + floor, time waiting, buttons **Acknowledge / Snooze / Done**. Below: the next 3 tasks.
2. **Tables** tab: 11 tables grouped by floor, color + elapsed time + countdown while `occupied`. Tap a table → Take order / Add items, Mark served, Request bill, Move table, Set status, Ignore camera 5 min.
3. **Take order:** category chips → item cards (photo optional, veg/non-veg dot) → variant picker (Half/Full etc.) → qty stepper → optional quick-notes (less spicy, no onion-garlic, extra spicy, Jain) + free text → cart → **Send to kitchen** (single confirm). Price shown is the table's floor price. Out-of-stock items are hidden/greyed instantly.
4. **Cameras** tab: floor tabs with the annotated live image + camera offline notice.
5. **Takeaway:** "New parcel" creates a session without a table.
6. Persistent banner for alerts; sound-unlock and wake-lock status.
7. **Start shift** button on first open each day: unlocks audio, requests wake lock, confirms notification sound works with a test chime. If sound is locked the app shows a red "Sound off — tap to enable" bar.

### 11.2 Chef (tablet/monitor, landscape)
1. Columns **NEW / PREPARING / READY**. Ticket: KOT no., table + floor badge (AC / Non-AC), items with variant + qty, notes highlighted, age timer (amber at 10 min, red at 20 min). Oldest first.
2. Chime on every new ticket; **cancelled** tickets flash red with a different tone.
3. **By dish** toggle: aggregated counts across open tickets ("Veg Hakka Noodles (Full) × 3 — T2, T5, T9").
4. Big buttons: START, READY. READY immediately alerts the waiter.
5. **Out of stock** toggle per variant (instantly hides it in the waiter app).
6. Screen never sleeps; same start-shift sound unlock.

### 11.3 Receptionist (desktop/laptop)
1. List of open sessions/tables with running totals; red flags for **escalated waiter tasks** and **bill requests**.
2. **Bill screen:** items (qty × price), extras (quick buttons from menu items flagged `needsKitchen = false`, e.g. water bottle), free-form adjustments, discount (amount or %), tax lines, round-off, total.
3. Payment: one or **split** payments (cash/UPI/card). Marks PAID, closes session, table → needs cleaning.
4. **Print:** browser print styles for 80 mm thermal and A4. Bill shows restaurant name/address/GSTIN (if set), bill number, date, table, items, tax lines, footer.
5. Manual open of a table/takeaway; move table; void line item (reason required).

### 11.4 Admin
1. **Dashboard** with presets (Today, Yesterday, Last 7 days, This month, Custom): total earnings, number of bills, average bill, total orders and **total items ordered**, top and bottom dishes, earnings by floor (AC vs Non-AC), by hour, by payment method; operational numbers: average time from seated to first order, order → ready time, alert response time. CSV export.
2. **Menu manager:** categories, items, variants, per-floor prices, veg/non-veg, local-language name, needs-kitchen flag, availability; **CSV import** (§14).
3. **Floors & tables:** zones (AC flag, optional surcharge), tables, camera assignment.
4. **Cameras:** add camera (RTSP URL), test connection, **calibration page** (draw table polygons on a snapshot).
5. **Staff:** create users, set PINs/passwords, deactivate.
6. **Settings:** timers (§7.4), tax, restaurant profile, business-day start.
7. **Health page** (§15) and **Dev console** (hidden unless `ENABLE_DEV_CONSOLE=true`): live table grid with Occupied/Empty simulate buttons, event log, task list, time-skip button to jump the timer for tests.

---

## 12. Billing Rules

```
subtotal   = Σ qty × unitPricePaise          (non-cancelled items; prices were snapshotted at order time)
extras     = Σ extra adjustments (water bottle etc.)
surcharge  = zone rule: NONE | FLAT per bill | PERCENT of subtotal      (default NONE; AC cost is already in prices)
discount   = fixed or % (receptionist/admin; audited)
taxable    = subtotal + extras + surcharge − discount
tax        = taxable × rate         (rate from settings; inclusive/exclusive mode from settings)
total      = round to nearest rupee; roundOff shown as its own line
```
- The app must **not hardcode any tax rate**. The owner/accountant sets rate and mode. When tax > 0, show the tax split (CGST/SGST halves) on the printed bill.
- Bills have **sequential, never-reused numbers** (format in settings, e.g. `DS-2026-000123`). Voided bills keep their number.
- A bill is PAID when payments ≥ total. Reopening a paid bill: admin only, with a reason, audited.
- Cancelling an item before the chef presses START: waiter allowed. After: receptionist/admin with a reason; the chef's ticket shows it as cancelled.

---

## 13. Auth & Permissions

| Capability | Admin | Receptionist | Waiter | Chef |
|---|:-:|:-:|:-:|:-:|
| Menu, floors, tables, cameras, staff, settings | ✅ | ❌ | ❌ | ❌ |
| Reports / dashboard | ✅ | ❌ | ❌ | ❌ |
| Table board + camera view | ✅ | ✅ | ✅ | ❌ |
| Place orders, acknowledge/snooze tasks, set table state | ✅ | ✅ | ✅ | ❌ |
| Kitchen tickets, start/ready | ✅ | ❌ | ❌ | ✅ |
| Out-of-stock toggle | ✅ | ❌ | ❌ | ✅ |
| Bills, payments, extras, discounts | ✅ | ✅ | request only | ❌ |
| Void after cooking, reopen bill | ✅ | void with reason | ❌ | ❌ |

- Staff: name + 4–6 digit PIN, long-lived device sessions (30 days) so nobody logs in during rush. Admin: password. Rate-limit login attempts. Every API route checks the role on the server.
- Default seeded users for development only (printed in README; the setup wizard forces new credentials in production).

---

## 14. Setup Wizard & Menu Import (so installation takes hours, not days)

First-run wizard in the admin app:
1. Restaurant profile (name, address, GSTIN optional, bill footer).
2. Floors (2) with AC flag; tables per floor (labels like G1–G5, F1–F6).
3. Cameras: add RTSP URL → test → snapshot → **draw table polygons** → assign each table.
4. Menu import from **CSV/XLSX**:
   `category, item, local_name, variant, price_ground, price_first, veg(Y/N), needs_kitchen(Y/N)` → preview with errors → import. Items missing a floor price are flagged and unavailable on that floor until fixed.
5. Staff accounts and PINs.
6. Timers and tax review (shows 2-minute timer prominently).
7. "Test run": runs the simulator through occupied → alert → order → ready → bill, so the owner sees it work.

Seed a small realistic Indo-Chinese demo menu for development only (Veg Hakka Noodles Half/Full, Veg Manchurian Dry/Gravy, Schezwan Fried Rice, Hot & Sour Soup, Paneer Chilli, Chicken Lollipop, packaged water, cold drinks).

---

## 15. Reliability, Security & Operations (what makes it sellable)

- **Install:** one `install.sh` on a fresh Ubuntu mini PC: installs Docker, pulls images/builds, creates `.env` (random secrets), starts everything, enables boot start. A `docs/INSTALL.md` for a non-expert.
- **Auto-recovery:** all services restart on failure/boot. Worker is crash-safe (idempotent).
- **Backups:** nightly `pg_dump` to a local folder with 14-day retention; optional second copy to a USB path or cloud via `rclone` when internet exists. `restore.sh` + a tested restore procedure in docs.
- **Updates:** `update.sh` = backup → pull → migrate → restart → health check, with automatic rollback if health fails.
- **Health page + alerts:** database, worker tick, each camera fps/status, disk space, last backup, system time sync. Show a banner to admin/receptionist when something is red.
- **Logging:** structured logs with rotation; one-click "download diagnostics" zip (no video, no secrets).
- **Time:** require NTP sync; show a warning if the clock is off (timers depend on it).
- **Network:** LAN-only by default. Optional remote support via Tailscale or Cloudflare Tunnel, off by default and documented.
- **Security:** secrets only in `.env`; RTSP credentials never reach browsers; hashed PINs/passwords; vision secret rotation documented; CSRF-safe cookies; input validation everywhere.
- **Hardware guidance doc** for the owner: mini PC spec suggestion, UPS recommendation, camera placement tips (cover whole table + chairs, avoid backlight, mount high with a clear view), router/Wi-Fi coverage for both floors and the kitchen.
- **Staff quick-guides** (one page each, plain English, printable): waiter, chef, receptionist, admin.

---

## 16. Build Phases (framework first)

> The user will say "Do Phase N". Build only that phase. Do not touch later phases.

### Phase 1 — Core Engine ("the framework")
**Read:** §0, §3, §4, §6, §7, §9, §10.
**Build:** monorepo (`apps/web`, `apps/worker`, `services/vision`, `packages/core`), Docker Compose (db, web, worker, caddy placeholder), Prisma schema + migrations for the whole §9 model, seed (2 zones, 11 tables, demo menu, demo users), **pure core logic** in `packages/core`: `nextTableState`, task rules, timer evaluation, priority picker — with thorough Vitest tests. Vision event/heartbeat endpoints, worker with the 2-minute timer, SSE + snapshot, minimal auth, and the **Dev console** (live 11-table grid, simulate occupied/empty, event log, tasks, time-skip). Minimal "place test order" button in the dev console.
**Done when (acceptance):**
- Simulating `occupied` on a table starts a 120 s countdown; at 120 s ± 5 s a `needs_order` task exists and the table is `needs_order`.
- Placing an order at 100 s cancels it (no task is ever created).
- Restarting the worker at 60 s still fires the task at ~120 s, exactly once.
- Sending the same event twice (same `event_id`) causes no duplicates.
- `VISION_EMPTY` never frees a table with an unpaid bill; an unordered empty party is closed as abandoned after 60 s.
- All state-machine rows in §6.3 have passing tests.

### Phase 2 — Seeing (vision service, real camera pipeline)
**Read:** §8, §10 (vision endpoints), §4.
**Build:** the Python service per §8: RTSP/video-file input, YOLO11n person detection + tracking, polygon test, debouncer (pure + pytest), event/heartbeat posting with retry and idempotency keys, config pull, annotated snapshot endpoint, auto FPS reduction, reconnect logic, tuning CSV log. `zones.json` fallback for development; add a recorded-video demo script.
**Done when:** a sample restaurant video with table zones turns the Dev console tables occupied/empty correctly; walk-bys do not trigger; killing the stream shows camera-offline in the app and recovery after reconnect; measured FPS/CPU is reported in the README.

### Phase 3 — Waiter & Chef apps (real)
**Read:** §2, §5, §11.1, §11.2, §12 (item cancel rules), §13.
**Build:** PIN login, PWA shell (manifest, icons, service worker, standalone), Caddy HTTPS, waiter Next-up/Tables/Order/Cameras screens, chef board with batching and out-of-stock, sound unlock/wake lock/vibration, offline-tolerant order queue with `clientKey` idempotency, connection indicator, move table, takeaway sessions.
**Done when:** the full flow §5 steps 1–9 works across two real phones and a tablet over HTTPS on the LAN, including killing Wi-Fi on the waiter phone mid-order and recovering without a duplicate order.

### Phase 4 — Receptionist & Billing
**Read:** §11.3, §12, §9 (Bill/Payment).
**Build:** open-sessions list, bill calculator (pure + tests: AC vs non-AC, extras, discount, tax inclusive/exclusive, round-off, split payments), payment flow, bill numbering, print layouts, escalation view, voids with audit.
**Done when:** hand-calculated example bills match to the paisa; table goes to `needs_cleaning`; printing 80 mm and A4 looks right.

### Phase 5 — Admin
**Read:** §11.4, §14 (menu import), §13.
**Build:** menu/floors/tables/staff/settings CRUD, CSV/XLSX menu import with preview, dashboard + CSV export, business-day logic.
**Done when:** an owner can configure everything without touching the database and reports match totals computed independently from the raw bills.

### Phase 6 — Cameras on site: calibration & tuning
**Read:** §8.3, §8.7, §8.8, §11.4 (Cameras).
**Build:** camera add/test, calibration page (draw polygons), live view proxy, vision mute, admin "Recent detections" review screen, tuning log viewer.
**Done when:** a non-developer can set up a camera and 11 table zones in under 30 minutes.

### Phase 7 — Productization
**Read:** §14, §15.
**Build:** install/update/backup/restore scripts, health page, setup wizard, diagnostics download, docs (INSTALL, hardware guide, quick-guides), staff-facing empty states and error messages in plain English.
**Done when:** a clean mini PC goes from blank to a working system by following the docs; pulling the power cable mid-service and powering back up resumes everything with data intact.

### Phase 8 — Pilot support (small, mostly process)
**Build:** a "shadow mode" setting (alerts and orders shown, but the owner keeps paper as backup) and a daily accuracy review screen comparing what the camera said with what staff corrected manually (manual overrides are logged for this).
**Pilot checklist (document it):** 2–3 days shadow mode → tune thresholds from the tuning log → go live with paper as backup for a week → review overrides and complaints → fix list.

---

## 17. Acceptance Scenarios (the owner will test these at handover)

1. A party sits at G3 → 2 minutes pass with no order → the waiter's phone shows "Table G3 is waiting to order" with sound and vibration.
2. A party sits at F2 and the waiter takes the order at 2 minutes → no alert ever appears.
3. Waiter taps Snooze → alert returns 5 minutes later.
4. Waiter ignores the alert for 2 minutes → receptionist screen flags it red.
5. Waiter orders 3 items for an AC table → chef sees one ticket with the **AC** badge and the right quantities within 1–2 seconds.
6. Chef taps Ready → waiter gets a "food ready" alert that outranks any waiting-to-order alert.
7. Same dish ordered by tables G1, F3, F4 → chef's "By dish" view shows total ×3.
8. Chef marks a dish out of stock → it disappears from the waiter's menu immediately.
9. Same dish costs the **ground-floor price** at G2 and the **AC price** at F2 on their bills.
10. Receptionist adds two water bottles and a 10% discount → total is correct; prints a bill; pays half cash / half UPI.
11. Customers leave after paying → table turns grey "needs cleaning" → waiter taps Cleaned → green.
12. Customers get up and leave without ordering → table frees itself after about a minute.
13. Waiter walks between tables → no false alerts.
14. Router is unplugged for 5 minutes → waiter's order is saved and arrives when Wi-Fi returns, exactly once.
15. Mini PC is power-cycled → system is back in under 3 minutes with all data and any running timers.
16. One camera is unplugged → everyone sees "Camera offline"; waiter can still set tables by hand.
17. Owner opens the dashboard for the last 7 days → sees total earnings and total food items ordered and matches his own cash book.

---

## 18. Not in v1 (do not build)

Customer QR ordering, online payment gateway, tips, inventory/supply notifications, multi-restaurant/cloud SaaS, native mobile apps, voice ordering, kitchen printer (ESC/POS) integration, table merging, reservations, staff recognition in vision, loyalty/customer database, WhatsApp/SMS integration.

---

## 19. Defaults to Use When Unspecified

| Topic | Default |
|---|---|
| Timer | 120 s from `occupied` |
| Currency/locale | ₹, `en-IN`, `Asia/Kolkata` |
| Tax | 0 until set by owner; exclusive mode |
| Surcharge | None (AC is in prices) |
| Business day start | 05:00 |
| Staff login | 4-digit PIN; admin password |
| Who opens walk-in/takeaway | Waiter or receptionist |
| Cameras | 1–2 per floor, RTSP substream |
| Language | English UI; item names may also have a local-language name |
| Bill number format | `DS-<year>-<6-digit sequence>` |
| Vision events retention | 30 days |
| Backups | nightly, keep 14 |
