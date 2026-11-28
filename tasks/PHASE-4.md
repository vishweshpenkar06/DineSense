# Phase 4 report — service correctness

| Task | Status | Evidence | Files and migrations |
|---|---|---|---|
| C-1 | done | Acceptance: 20 parallel distinct orders succeed with unique consecutive KOT numbers; same-key duplicates return one order | `packages/db/src/orders.ts`, acceptance |
| C-2 | done | Core derive-service-state tests; acceptance two-ticket serve test and bill-request test updated to the derived rule | `packages/core/src/serviceState.ts`, `packages/core/src/index.ts`, `packages/db/src/engine.ts`, service call sites |
| C-3 | done | Acceptance concurrent vision/manual event test; table row lock and advisory KOT lock | `packages/db/src/engine.ts`, `packages/db/src/orders.ts` |
| C-4 | done | Acceptance: no auto-seat while cleaning or during 60s grace, seats after grace | `packages/core/src/stateMachine.ts`, `packages/core/src/types.ts`, `packages/db/src/engine.ts`, `packages/db/prisma/schema.prisma`, migration `20261128093000_table_cleaned_at` |
| C-5 | done | Core settings/state-machine tests at 180s; acceptance and docs updated; stored DB setting migrated | migration `20261128093634_decision_timer_180`, settings, setup/dev/login/docs |
| C-6 | done | Acceptance floor-only stock toggle; chef stock panel has a floor selector | `packages/db/src/service.ts`, availability API, chef page |

Verification: typecheck clean, core 139/139, web unit 6/6, acceptance 150/150 on scratch DB, Playwright 17/17, production build clean.

Updated old tests: state-machine `VISION_OCCUPIED` from `needs_cleaning` now stays put; bill-request acceptance now serves the order before requesting the bill because a live order keeps the table `ordered`.

Not verified: real camera state changes during cleaning, physical multi-device concurrency, and power-cut recovery.

Owner decision needed: confirm whether chef should see one combined stock view or explicit per-floor availability as shipped.
