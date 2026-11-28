# Production Hardening Plan

Base: `ff58391`. Branch: `production-hardening`.

Owner settings: keep DineSense (skip Phase 8), decision timer 180s, replace camera detector with YOLOX/ONNX after licence verification, waiters keep camera view.

Rules: test first, no test weakening, migrations only as new files, scratch DB only for acceptance, one commit per task, phase reports after every phase.

## Phase 0 — Baseline
- Record npm install, generate, typecheck, core, build, acceptance on scratch DB, E2E with dev stack, vision pytest.
- Report and continue only after results are recorded.

## Phase 1 — Lost orders and money
- `P1-0` web test harness, E2E credential injection, scratch guard.
- `P1-1` offline queue persistence, failure states, single-flight, server duplicate success.
- `P1-2` unpaid visit cannot be manually freed; void/cancel tickets/corrections report.
- `P1-3` tender vs applied payments, change on receipt, day-close correctness.

## Phase 2 — Billing correctness
- `B-2` issue-only bill numbers, estimate text, FY numbering, nullable number, demo no number.
- `B-1` registration type and receipt headings.
- `B-3` remove mandatory service charge.
- `B-4` paisa-level GST/receipt/report agreement.

## Phase 3 — Security
- `S-1` network exposure, `S-2` secrets, `S-3` throttle, `S-4` session revocation, `S-5` PIN policy, `S-6` remove demo bypass, `S-7` health privacy, `S-8` non-root containers, `S-9` API auth matrix.

## Phase 4 — Service correctness
- `C-1` atomic KOT, `C-2` derived service state, `C-3` locks/constraints, `C-4` cleaning grace, `C-5` timer 180, `C-6` per-floor stock.

## Phase 5 — Camera and privacy
- `V-1` YOLOX/ONNX licence verification and replacement, `V-2` camera access toggle and privacy wording.

## Phase 6 — Operations
- `O-1` backups, `O-2` dependencies, `O-3` tagged updates, `O-4` CI, `O-5` self-host fonts, `O-6` reliability, `O-7` external config, `O-8` clean install.

## Phase 7 — Screen fixes
- Reception payment visibility, waiter grid/touch targets, duplicate controls, queued/failed counts, light/dark screenshots.

## Phase 8 — Rename
- Skipped: `PRODUCT_NAME` blank.

## Phase 9 — Release
- Full verification, `docs/HANDOVER.md`, truthful README, tagged RC.
