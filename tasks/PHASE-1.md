# Phase 1 report — lost orders and money

| Task | Status | Evidence | Files and migrations |
|---|---|---|---|
| P1-0 | done | `npm test -w @dinesense/db` 2/2; `npm test -w @dinesense/web` 1/1; live DB acceptance guard rejected | `packages/db/src/scratch.ts`, `packages/db/vitest.config.ts`, `apps/web/vitest.config.ts`, `apps/web/src/__tests__/api-auth.test.ts`, `e2e/helpers.ts`, `README.md` |
| P1-1 | done | E2E 5/5 order-flow incl. 500, 401, 409; acceptance concurrent duplicate checks; core 124 | `apps/web/src/lib/offline-orders.ts`, `apps/web/src/lib/client.ts`, `apps/web/src/components/waiter-orders.tsx`, `apps/web/src/app/waiter/layout.tsx`, `apps/web/src/app/waiter/page.tsx`, `apps/web/src/app/waiter/order/page.tsx`, `packages/db/src/orders.ts`, `e2e/order-flow.spec.ts` |
| P1-2 | done | Core MANUAL_SET refusal tests; acceptance 131/131 with unpaid-table, void/ticket/correction checks; E2E staff-free test | `packages/core/src/stateMachine.ts`, `packages/db/src/engine.ts`, `packages/db/src/billing.ts`, `packages/core/src/dto.ts`, `packages/db/src/reports.ts`, `apps/web/src/app/waiter/page.tsx`, `e2e/order-flow.spec.ts` |
| P1-3 | done | Core 127/127; acceptance 135/135; E2E 14/14 incl. tender/change receipt; `check:payments` script ran | `packages/core/src/billing.ts`, `packages/core/src/__tests__/billing.test.ts`, `packages/core/src/dto.ts`, `packages/db/src/billing.ts`, `packages/db/src/dayClose.ts`, `packages/db/src/reports.ts`, `packages/db/prisma/schema.prisma`, migration `20261128073346_payment_tendered`, reception/day-close UI, E2E |

Verification: typecheck clean, build clean, DB/web unit tests pass, core 127/127, acceptance 135/135 on scratch DB, Playwright 14/14, read-only payment script ran without modifying data.

Updated old test: `packages/core/src/__tests__/billing.test.ts` no longer treats a 22000 UPI tender for a 21200 bill as fully applied. That behaviour is now rejected; the settlement test uses an exact payment.

Not verified: physical cash drawer, printed paper receipt, real phones and real concurrent users.

Owner decision needed: confirm whether a cash line should be rejected when non-cash already covers the whole bill (implemented as reject) and define the daily cash-close handover policy.

New problems noticed: `docs/screenshots` light/dark captures still do not visibly differ; the API auth meta-test only checks source guard presence, not runtime behaviour.
