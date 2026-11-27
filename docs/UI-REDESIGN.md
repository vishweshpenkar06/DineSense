# DineSense — UI Redesign Plan

> **Status:** U0 foundations are shipped. The live screens still use the warm-ink identity; phases U1–U7 below are pending. The 2026-11-27 app-screen direction is `framed-sheet` (light L-frame, white sheet, quiet KPIs, accent only on data/status); seed 216910756. The full direction artifact is local-only.

> Purpose: make DineSense look and feel like a modern, professional product that a restaurant owner will pay for. This file is written for an AI coding agent. Do **one phase per session** (§6). Read §0–§5 for context, then do only the phase you are told.

---

## 0. Rules for the agent (read first)

1. **UI only.** Do not change `apps/web/src/app/api/**`, `packages/**`, `services/**`, `apps/worker/**`, Prisma, the state machine, the 120-second timer, the offline order queue, sound/vibration/wake-lock logic or any endpoint. If a screen needs data it does not have, stop and report; do not invent API changes.
2. **Do not break the tests.** `e2e/` finds things by role and accessible name. Keep these names exactly, or update the test in the same commit: `Sign in`, `Admin password`, `Send to kitchen`, `Order` (link), `Ready` (button), and the `.bill-print` class. Run `npm run typecheck` and `npm run test:e2e` before every commit.
3. **Behaviour stays identical; presentation changes.** Same actions, same API calls, same permissions.
4. **Only the dependencies listed in §3.** Say in the README why each was added.
5. **After each phase, produce screenshots** (§7) into `docs/screenshots/` and list what looks wrong to you. Do not claim a screen "looks good" if you did not look at the screenshot; if your model cannot view images, say so and let the owner review.
6. Keep every visible label in plain English. No internal words in the UI ("P2", "OPEN", "ACK", "session", "snapshot").

---

## 1. What is wrong today (evidence from the code)

| # | Problem | Evidence | Why it matters | Fix |
|---|---|---|---|---|
| 1 | **No design system**, only copy-pasted classes | `BTN` / `BTN_PRIMARY` redefined in waiter, chef, reception, dev and admin; ~565 raw `className` attributes across 6 screen files; `components/` has only 3 files | Screens drift apart, every change must be repeated, cheap agents break things | Build shared primitives (§4) |
| 2 | **Text is too small** | 59× `text-[11px]`, 37× `text-[10px]`, 1× `text-[9px]`; bottom-nav labels are 10 px | A waiter reads the phone at arm's length in a dim room | Minimum 12 px labels, 16 px body on waiter/chef |
| 3 | **Table status is barely visible** | State styles are 3–6 % tints (`bg-accent/[0.035]`); the state is an 8 px dot plus a 10 px pill | The whole product is "see 11 tables at a glance"; it fails that | Solid state colours + icon + large label |
| 4 | **Urgent alerts are deliberately quiet** | README: "quiet state surfaces instead of alert-colour floods" | One waiter, two floors: urgent must look urgent | Solid red / violet, pulse, pinned banner on every waiter screen |
| 5 | **Internal jargon on screen** | Next-up card shows `P2 · waiting 3m` and the raw status `open` | Staff do not know what "P2" means | Plain words ("Waiting 3 min") |
| 6 | **Key actions hidden / fiddly** | "Move table" and "Set status" are native `<select>`s inside a collapsed `<details>` "More actions" | Native selects are slow and error-prone on phones | Bottom sheet with big buttons |
| 7 | **Serif font on work screens** | Fraunces used for "Floor", "Tables" headings | Slower to scan than a clean sans | Manrope for work screens; Fraunces only on login, brand and printed bill |
| 8 | **Dark theme only** | `color-scheme: dark`, no light theme | Reception/admin sit at a desk in daylight; owners expect a "modern website" look | Light + dark tokens |
| 9 | **Weak feedback** | Errors are red text banners; busy = faded button; no toasts, skeletons or success states | People cannot tell if a tap worked | Toasts, button loading state, skeletons |
| 10 | **Dashboard charts are hand-made CSS bars** | `HourlyChart` uses `style={{height}}` divs | No axes, tooltips or date labels | Recharts |
| 11 | **Huge single-file screens** | reception 897 lines, dev 729, waiter order 656, waiter 630, admin 592 | Impossible to restyle safely | Split into components while redesigning |
| 12 | **Palette leaks outside tokens** | `sky-400` for "ordered"; `slate` remapped to warm greys in `tailwind.config.ts` | Surprising colours, hard to theme | Semantic tokens only |

---

## 2. Design direction

**Principles**
1. **Status first.** The first thing seen on every screen is "what needs me now?"
2. **One primary action per screen or card.** Everything else is secondary.
3. **Calm when idle, loud when urgent.** Neutral surfaces normally; saturated solid colour only for things that need action.
4. **Big and plain.** Large touch targets, big type, plain words, icon + text (never colour alone: colour-blind staff exist).
5. **Fast feedback.** Every tap shows an immediate result (loading, success toast, state change).

**Look:** clean, light-first, generous spacing, soft shadows, rounded corners, saffron brand accent kept for identity. Reference for inspiration (do not copy): modern restaurant handheld/KDS apps (Toast, Square) for waiter/chef density; Linear and Stripe dashboards for admin layout and charts.

### 2.1 Colour tokens
Define as CSS variables in `globals.css` (`:root` = light, `[data-theme="dark"]` = dark), map them in `tailwind.config.ts` as semantic names (`bg-surface`, `text-muted`, `bg-status-free`, …), and **delete the `slate` override and all raw palette colours from screens**.
Defaults: Waiter = follows system theme, Chef = dark, Reception/Admin = light, with a theme toggle in the user menu.

| Token | Light | Dark |
|---|---|---|
| `bg` | `#FAF8F4` | `#0F0E0C` |
| `surface` | `#FFFFFF` | `#1A1814` |
| `border` | `#E7E0D4` | `#2E2822` |
| `text` | `#1C1915` | `#F4EFE4` |
| `muted` | `#6B6358` | `#A79D8E` |
| `brand` (fill, text on it = `#1C1915`) | `#F5A524` | `#F5A524` |
| `brand-text` | `#B45309` | `#F5A524` |

**Table / task status** (fill + text; icon always shown beside the label). All pairs below were checked at ≥ 4.5:1 text contrast.

| State | Light fill / text | Dark fill / text | Style |
|---|---|---|---|
| free | `#ECFDF3` / `#166534` | `#0F2A1C` / `#86EFAC` | soft |
| occupied (timer running) | `#FFF7E0` / `#92400E` | `#2B2108` / `#FCD34D` | soft + countdown ring |
| **needs_order** | **`#DC2626` / `#FFFFFF`** | same | **solid + pulse** |
| ordered | `#EFF6FF` / `#1D4ED8` | `#10203F` / `#93C5FD` | soft |
| **food_ready** | **`#7C3AED` / `#FFFFFF`** | same | **solid + pulse** |
| dining | `#F3F4F6` / `#374151` | `#23262B` / `#D1D5DB` | soft |
| bill_requested | `#FFEDD5` / `#9A3412` | `#2F1706` / `#FDBA74` | soft, strong border |
| needs_cleaning | `#F3F4F6` / `#374151` | `#23262B` / `#D1D5DB` | soft + sparkles icon |

Suggested lucide icons: free `Armchair`, occupied `Timer`, needs_order `BellRing`, ordered `ChefHat`, food_ready `Utensils`, dining `Soup`, bill_requested `Receipt`, needs_cleaning `Sparkles`.

### 2.2 Type scale (Manrope; tabular numbers for money and time)
12 (labels, min) · 14 (desktop body) · 16 (waiter/chef body) · 18 · 22 · 28 · 36 (table numbers, chef ticket header). Never below 12 px. No more `text-[10px]` / `text-[11px]`.

### 2.3 Size, shape, depth
Touch targets: **48 px** minimum on waiter/chef, 40 px on desktop. Radius: 12 controls, 16 cards, 24 sheets. 8 px spacing grid. Light shadows (`0 1px 2px` / `0 8px 24px` at low opacity), no heavy glows. Safe-area insets respected on phones.

### 2.4 Motion
150–200 ms transitions. A pulse (opacity/ring) only on `needs_order` and `food_ready`. Everything animated must respect `prefers-reduced-motion`.

---

## 3. Dependencies allowed

`shadcn/ui` (Radix-based Sheet, Dialog, Tabs, Select, DropdownMenu), `class-variance-authority`, `clsx`, `tailwind-merge`, `sonner` (toasts), `recharts` (charts). The repo is on Tailwind 3.4: use shadcn's Tailwind v3 setup, or upgrade to Tailwind 4 first, and say which you chose in the README. No animation library is needed. Keep `lucide-react`.

---

## 4. Shared components (built in Phase U0, used everywhere after)

Put in `apps/web/src/components/ui/`:
`Button` (primary / secondary / ghost / danger; sizes md / lg / xl; `loading` prop shows a spinner and disables), `IconButton`, `Card`, `StatusPill` (icon + label from the token table), `Badge`, `Input`, `Select`, `SegmentedControl`, `QtyStepper`, `Tabs`, `Sheet` (bottom sheet on phones, side panel on desktop), `Dialog`, `Toast` (sonner), `Skeleton`, `EmptyState`, `StatTile`, `CountdownRing`, `PageHeader`, `ThemeToggle`, `AlertBanner`.
Also build a **component gallery page** at `/dev/ui` (dev-console only, needs no database) showing every component in every state in both themes. This is how the owner reviews the design without needing the full stack.
When a screen is migrated, **delete its local `BTN` constants**.

---

## 5. Screen specifications

### 5.1 Login
PIN pad with large keys (≥ 64 px), dots showing digits entered, clear error text, brand mark on top. Admin password stays a secondary mode. Fraunces allowed here.

### 5.2 Waiter (phone, portrait)
- **Header:** small and quiet: name, connection dot, sound status. No big serif title.
- **Alert banner (pinned at the top of every waiter screen, including the order screen)** whenever the top task is `needs_order` or `food_ready`:
  - Colour by task type (needs_order = solid red, food_ready = solid violet, bill_requested = soft orange, clean_table = grey, custom = soft blue).
  - Large text: "Table G3 is waiting to order", second line: "Ground floor · waiting 2:10".
  - **One** primary button: while open "I'm going" (calls acknowledge) and "Snooze 5 min" secondary; after acknowledging, the primary becomes "Done" (or "Mark served" for food ready). Same API calls as today.
  - Below it, the next 3 tasks as a compact list.
- **Floor view:** a segmented control `Ground · First` (not one long scroll). Tables as a **2-column grid of big tiles** (3 columns on tablet): table label 28 px bold, StatusPill, second line either the countdown ("Order alert in 2:14", with CountdownRing) or "Seated 12 min". `needs_order` and `food_ready` tiles are solid and pulse.
- **Tap a tile → bottom sheet** with: **Take order** (primary, 56 px), then Mark served, Request bill, Move table (list of free tables as buttons), Set status (grid of status chips), Ignore camera 5 min. No native `<select>`.
- **Bottom tab bar** (56 px, labels ≥ 12 px): Floor · Tasks (with count badge) · Cameras · More (Parcel, Theme, Sign out).
- **Shift bar:** "Sound off, tap to enable" stays but is a clear amber bar, not tiny text.

### 5.3 Waiter order screen
Sticky search + category chips. Item rows: name, veg/non-veg dot, price **for this table's floor**, out-of-stock greyed with a reason. Tap an item → **item sheet**: Half/Full (or Dry/Gravy) as a large SegmentedControl, QtyStepper, quick-note chips (less spicy, no onion-garlic, extra spicy, Jain) + free text, "Add · ₹180" button. Sticky bottom bar "3 items · ₹540 · Review" → cart sheet with edit/remove and a large **Send to kitchen** (keep that exact accessible name). Success toast; offline-queued orders show a clear "Saved, will send when online" state.

### 5.4 Chef (tablet, landscape)
Top bar: counts per column, sound toggle, `By ticket · By dish` segmented control, theme. Three columns (New / Preparing / Ready). Ticket: coloured age strip (neutral → amber at 10 min → red at 20 min, using existing thresholds), table label 36 px, floor badge (AC / Non-AC), items at ≥ 20 px with quantity first, notes as a highlighted chip with an icon, **one full-width 64 px button** (Start / Ready: keep the accessible name `Ready`). Cancelled tickets: red with a "Cancelled" banner. Nothing smaller than 14 px.

### 5.5 Reception (desktop)
Two panes: left = open tables as cards (table, floor badge, running total, status, red flag for bill request or escalated waiter task); right = selected bill. Bill: item table, extras quick-add chips (water bottle etc.), discount control, tax lines, round-off, **sticky footer with the total and a large Pay button**. Payment in a sheet: split rows (cash / UPI / card) with remaining amount shown live. Print preview keeps `.bill-print` and its 80 mm / A4 behaviour untouched.

### 5.6 Admin
Persistent left sidebar (collapsible; icon + label) replacing the top tab strip; page header with title and actions. **Dashboard:** KPI row (Earnings, Bills, Average bill, Items ordered) with change versus the previous period if the data allows, date-range control with presets (Today, Yesterday, Last 7 days, This month, Custom), a Recharts bar chart for earnings by hour/day with axes and tooltips, top dishes as a horizontal bar list, floor split and payment split as small charts, CSV export button. **Menu:** searchable, filterable table with sticky header; edit in a side sheet; CSV import as a stepper (choose file → preview → import). **Floors, Cameras, Staff, Settings, Health, Pilot:** same page-header + card + side-sheet pattern, empty states with a clear next action. Setup wizard: a visible step progress bar.

---

## 6. Phases (one agent session each)

Prompt template: *"Read docs/UI-REDESIGN.md sections 0–5. Do Phase U<N> only. Follow §0 rules. When done: typecheck + e2e pass, screenshots saved, report in ≤10 lines what changed and what still looks off."*

| Phase | Scope | Done when |
|---|---|---|
| **U0 Foundations** | Tokens (light/dark), Tailwind mapping, remove `slate` override, font setup (Manrope for work screens), install allowed deps, build all §4 components, `/dev/ui` gallery, theme toggle + per-role defaults | Gallery shows every component in both themes; no screen changed yet; typecheck + e2e green |
| **U1 Waiter floor** | §5.2 (header, alert banner, floor tiles, tile sheet, tab bar, shift bar) | On a 390 × 844 viewport all 11 tables are scannable at a glance; a seeded `needs_order` table is unmistakable; e2e green |
| **U2 Waiter order** | §5.3 | A 3-item order in ≤ 6 taps; "Send to kitchen" still works; offline queue unchanged |
| **U3 Chef** | §5.4 | Readable from 1 m on a 1024 × 768 landscape viewport; By-dish works; cancelled tickets are obvious |
| **U4 Reception** | §5.5, split `reception/page.tsx` into components | Bill totals unchanged (e2e + acceptance green); print layouts unchanged |
| **U5 Admin shell + dashboard** | §5.6 sidebar, dashboard with Recharts | Dashboard numbers identical to before; charts have axes + tooltips |
| **U6 Admin panels, login, setup wizard** | Remaining §5.1 / §5.6 | All panels use shared components; no local `BTN` constants remain anywhere |
| **U7 Polish** | Skeletons on every loading state, toasts replace banner errors, empty states, focus rings, reduced-motion, contrast pass, PWA icons/theme colour per theme, README screenshots | Lighthouse accessibility ≥ 90 on waiter, chef, reception; no text < 12 px; screenshots in README |

---

## 7. Visual review loop (do this every phase)

1. Add `e2e/screenshots.spec.ts` (once, in U0) that logs in as each role against the seeded dev stack and saves PNGs to `docs/screenshots/` at **390 × 844** (waiter), **1024 × 768** (chef tablet) and **1440 × 900** (reception/admin), light and dark.
2. After each phase run it and look at the images. Fix: overlapping text, clipped buttons, anything under 12 px, low contrast, inconsistent spacing.
3. **Mock first (recommended):** coding models are weak at visual taste. Before U1, U3, U4 and U5, generate a visual mock of that screen (for example in v0.app or Claude Design) using §2 and §5 as the prompt, pick one, save it as `docs/mocks/<screen>.png`, and tell the agent: *"Match docs/mocks/<screen>.png using the §4 components."* This produces far better results than describing the design in words.
4. The owner (or his friend at the restaurant) checks the waiter and chef screens on the real devices before U7 closes.
