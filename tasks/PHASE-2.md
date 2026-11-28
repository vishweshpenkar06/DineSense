# Phase 2 report — billing correctness

| Task | Status | Evidence | Files and migrations |
|---|---|---|---|
| B-2 | done | Core FY/format tests; acceptance 140/140; E2E estimate/issue test; no bill number on view, issue allocates `DS/26-27/00001`, issued lines locked, setup demo does not consume a number | `packages/core/src/business.ts`, `packages/core/src/billing.ts`, `packages/db/src/billing.ts`, `packages/db/src/setup.ts`, `packages/db/prisma/schema.prisma`, migration `20261128075812_bill_fy_issue`, issue API and reception UI |
| B-1 | done | Core heading/tax tests; acceptance setup rejects missing registration type; E2E receipt shows Tax Invoice | `packages/core/src/dto.ts`, `packages/core/src/billing.ts`, `packages/db/prisma/schema.prisma`, migration `20261128083803_registration_type`, admin/setup APIs and forms, reception receipt |
| B-3 | done | Settings unit test forces 0; acceptance bill has zero service charge even when legacy setting was set | `packages/core/src/settings.ts`, `packages/db/src/admin.ts`, admin settings UI, acceptance |
| B-4 | done | Core mixed-rate/inclusive/discount tests; acceptance per-rate CGST/SGST agreement; E2E 80 mm/A4 receipt checks | `packages/core/src/dto.ts`, `packages/db/src/reports.ts`, admin overview, receipt UI |

Verification: typecheck clean, core 131/131, acceptance 140/140 on scratch DB, Playwright 15/15, production build clean.

Updated old tests: the overpayment assertion now rejects non-cash overpayment instead of treating tender as applied; the service-charge acceptance scenario now proves no mandatory charge is added; the "opening a bill allocates" test now proves viewing does not allocate and issuing does.

Not verified: accountant sign-off, legal interpretation of CCPA service-charge guidance, real printed invoices and real printer rollover behaviour.

Owner decision needed: accountant must confirm registration type, GST rate, SAC/HSN choice, numbering and correction policy before go-live.

New problems noticed: the web Vitest file had to move out of `apps/web/src` because Next tried to bundle `node:fs`; the E2E suite is order-sensitive because the setup test toggles setup completion.
