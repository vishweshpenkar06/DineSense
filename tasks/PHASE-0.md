# Phase 0 baseline

Branch: `production-hardening`. Base: `ff58391`.

| Check | Command | Result |
|---|---|---|
| Install | `npm install` | pass |
| Prisma generate | `npm run db:generate` | pass |
| Typecheck | `npm run typecheck` | pass |
| Core | `npm run test:core` | 121/121 pass |
| Build | `npm run build` | pass |
| Migrations | `npx prisma migrate deploy` against `dinesense_acceptance` | pass |
| Acceptance | `npm run acceptance -w @dinesense/db` against scratch DB | 122/122 pass |
| Vision | `docker compose run --rm --no-deps vision pytest` | 36/36 pass |
| E2E first run | `npx playwright test` with dev console enabled | 8/9 pass; cameras tuning poll timed out |
| E2E camera retry | `npx playwright test e2e/cameras.spec.ts` | 1/1 pass |

The camera E2E failure is timing-sensitive in the tuning log poll. No test was changed. Baseline is usable but flaky.

Notes:
- Acceptance required explicit `DATABASE_URL` for `dinesense_acceptance` and the scratch-DB `ENCRYPTION_KEY`.
- E2E required `ENABLE_DEV_CONSOLE=true`, `VISION_DEMO=true` and `E2E_*` credentials injected from private `.env`.
- The running stack was restored to production flags after the baseline.
