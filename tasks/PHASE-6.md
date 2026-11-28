# Phase 6 report — operations

| Task | Status | Evidence | Files |
|---|---|---|---|
| O-1 | done | Health exposes `backupOffsite`/`backupWarning`; scratch restore drill restored 4 users, 11 tables and 9 menu items from a dump | `apps/web/src/lib/health.ts`, `scripts/verify-backup.sh` |
| O-2 | partial | Zod upgraded to 4.6.7 with typecheck/tests/build green; Python deps pinned; 8 advisories remain (next/postcss, prisma/@prisma/config, deepmerge-ts/effect, exceljs/uuid) | `apps/web/package.json`, `services/vision/requirements.txt`, `package-lock.json` |
| O-3 | done | `update.sh` now requires a release tag, fetches tags, checks out the branch after rollback and resets to the previous commit | `scripts/update.sh` |
| O-4 | done | CI workflow covers quality, acceptance with a scratch Postgres service, vision tests and Playwright with dev override | `.github/workflows/ci.yml` |
| O-5 | done | Google Fonts removed; Manrope and Fraunces self-hosted via Fontsource; clean build passed | `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css` |
| O-6 | done | Reception red banner only for `down`; log rotation config and compose log limits; disk/DB/worker health already present | `apps/web/src/app/reception/page.tsx`, `deploy/logrotate.conf`, `docker-compose.yml` |
| O-7 | done | Restaurant name, Wi-Fi SSID and server URL come from env for seed and Android build; installer writes them | `packages/db/prisma/seed.ts`, `apps/android/app/build.gradle.kts`, `MainActivity.java`, `scripts/build-android.sh`, `install.sh` |
| O-8 | blocked | No spare Ubuntu VM or physical power-cut test rig available | manual checklist remains |

Verification: typecheck clean, web unit 6/6, DB unit 2/2, core 140/140, acceptance 150/150 on scratch DB, vision pytest 38/38, Playwright 18/18, production build clean, production stack exposes only Caddy 80/443.

Not verified: fresh Ubuntu VM install, reboot/power-cut recovery on target hardware, real offsite backup destination.

Owner decision needed: choose USB or rclone offsite backup target; decide whether to accept Next 16 and Prisma 7 major upgrades for remaining advisories. `exceljs` advisory has no non-major fix and a downgrade is not allowed.
