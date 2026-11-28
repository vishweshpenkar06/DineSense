# Phases 8–9 report — rename and release verification

Phase 8: skipped. `PRODUCT_NAME` was blank, so the app name stays DineSense and no Android `applicationId` change was made.

## Release verification

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | Seat, alert, order, cook, serve, bill, pay, clean on both floors with correct prices | partial | E2E order flow on Ground tables; acceptance covers AC price zone `F2` and full lifecycle |
| 2 | Server stopped while Wi-Fi stays on; restart, no lost/duplicate order | partial | E2E abort and 500 route tests prove queue persistence; full server stop/restart not automated |
| 3 | Two phones and reception acting at once | partial | Playwright uses three browser contexts; physical devices not used |
| 4 | Waiter cannot make an unpaid bill disappear | pass | E2E and acceptance 409 checks |
| 5 | Cash, UPI, card and split payments match day close | pass | Acceptance tender/change and day-close assertions |
| 6 | Bill numbers consecutive, ≤16 chars, FY rollover | partial | Acceptance consecutive issue and format checks; core FY boundary test; real 31 Mar system clock not tested |
| 7 | Deactivated staff cut off immediately | pass | E2E deactivated session returns 401 |
| 8 | Only ports 80 and 443 answer from LAN | pass | Production stack `ss` output and direct :3000 connection refused |
| 9 | Reboot and power cut recover; backup restores | partial | Scratch restore drill restored 4 users, 11 tables, 9 menu items; reboot/power cut NOT VERIFIED |
| 10 | APK installs, connects, alerts and prints | partial | APK built/signed and emulator smoke-tested earlier; physical phone and printer NOT VERIFIED |

Final automated results: typecheck clean; web unit 6/6; DB unit 2/2; core 140/140; acceptance 150/150 on scratch DB; vision pytest 38/38; Playwright 22/22; production build clean.

Manual owner checks remain in `docs/HANDOVER.md`.
