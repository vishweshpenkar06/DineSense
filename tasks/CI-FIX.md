# CI fix report

## Root cause

GitHub Actions `acceptance` and `e2e` both failed while applying `20261128093634_decision_timer_180` to a fresh PostgreSQL database:

```text
ERROR: null value in column "updatedAt" of relation "Setting" violates not-null constraint
Failing row contains (DECIDE_WINDOW_S, 180, null).
```

The migration inserted a new `Setting` row without `updatedAt`. Existing local databases already had the key, so local `migrate deploy` passed; only fresh CI databases hit the insert branch.

A second fresh-database-only failure appeared after fixing the migration: the full demo seed had no GST registration type, so the new billing rule forced GST to zero and two accountant-facing acceptance checks failed.

## Fix

- `20261128093634_decision_timer_180/migration.sql` now sets `updatedAt` on both `UPDATE` and `INSERT` and uses `ON CONFLICT DO UPDATE`.
- The full demo seed sets `REGULAR` registration and a test GSTIN. The production minimal seed still leaves registration unset so `/setup` requires an explicit choice.
- CI `e2e` job now exports `DATABASE_URL` and `TRUST_PROXY` for host-side migration/seed steps.
- Added `scripts/preflight.sh` / `npm run preflight` to run typecheck, units, core, a fresh scratch-DB migration + seed + acceptance, and build before pushing.

## Second CI failure

After the migration fix, `e2e` still failed on `cameras.spec.ts` and the camera role test because the tests started before the vision service had produced its first snapshot; the snapshot route returned 404. Added `waitForCameraSnapshots()` to the E2E helpers and a service-health wait step to the workflow.

## Verification

- Fresh DB `dinesense_test_ci`: migrate deploy → seed → acceptance **150/150**.
- `npm run preflight`: typecheck clean; web 6/6; DB 2/2; core 140/140; acceptance 150/150; build clean.
- Full Playwright suite passed locally with the frame wait: 22/22.

## Prevention

`npm run preflight` must be run before pushing. It specifically catches migrations that only fail on empty databases and seed data that only works after previous local state.
