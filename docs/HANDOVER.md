# Handover: DineSense at The Chinese Chef

This release is a local-first appliance for one restaurant. The mini PC runs Postgres, the web app, worker and camera detector behind Caddy on the restaurant Wi-Fi.

## What is installed

- Roles: waiter, chef, receptionist, owner/admin.
- Flow: seat → 180s decision alert → order → kitchen → ready → served → bill → paid → clean.
- Billing: registration type, estimate before issue, financial-year bill numbers, GST breakup, UPI QR, split payments with tender/change, day close, void/corrections report.
- Safety: queued/failed orders survive network errors, unpaid visits cannot be freed, duplicate PINs rejected, sessions revoked on role/status change, anonymous health minimal, non-root containers, only Caddy 80/443 exposed.
- Camera: YOLOX nano ONNX bundled with checksum; waiter view controlled by Admin → Settings; no tracking IDs; manual seating works without cameras.

## Access

- Server: `http://192.168.1.43` (reserve this DHCP address). HTTPS is `https://192.168.1.43` after CA install on PWA devices.
- Android app: `dist/DineSense.apk`, version 1.2.0 (build 3). It shows Wi-Fi **The Chinese Chef** and needs no CA.
- Credentials: generated into the private `.env` file during install. Do not commit it. Change staff PINs in Admin → Staff.

## Before first live service

1. Confirm the accountant’s registration type, GST rate, HSN/SAC, numbering and correction policy.
2. Set GSTIN/FSSAI and UPI details in Admin → Settings. If `ENCRYPTION_KEY` changes, run `npm run db:reencrypt-cameras -w @dinesense/db` with the old key in `OLD_ENCRYPTION_KEYS` before restarting.
3. Import or confirm `data/menu-chinese-chef.csv` and both floor prices.
4. Confirm 11 tables, Ground non-AC and First AC.
5. Configure an off-machine backup target (`BACKUP_USB_PATH` or `BACKUP_RCLONE_REMOTE`) and verify `Admin → Health` no longer warns.
6. Run 2–3 shadow days with paper bills as the record (`docs/PILOT.md`).
7. Print test bills on the real 80 mm printer.
8. Test real phones, the router and real cameras on site.

## Daily operations

- `./scripts/healthcheck.sh` — service health.
- `./scripts/backup.sh` — manual backup; nightly backup is scheduled by `install.sh`.
- `./scripts/verify-backup.sh backups/<dump> dinesense_restore_check` — restore drill into a scratch DB.
- `RELEASE_TAG=vX.Y.Z ./scripts/update.sh` — backup, tagged update, health-gated rollback. Never update from the moving main branch.
- Admin → Health — database, worker, disk, backup, clock, cameras and diagnostics bundle.

## Verified in this repository

- Typecheck clean; web unit 6/6; DB unit 2/2; core 140/140; acceptance 150/150 on a scratch database; vision pytest 38/38; Playwright 22/22; production build clean.
- Production stack exposes only Caddy 80/443; direct port 3000 and database 5432 are closed in production.
- Restore drill restored 4 users, 11 tables and 9 menu items into a scratch DB.

## Not verified here

- Fresh Ubuntu VM install, reboot and power-cut recovery.
- Real printer, phones, router, cameras and detection accuracy.
- Legal review of bundled third-party licences and CCTV notice wording.
- Major dependency upgrades still reported by `npm audit` (Next 16, Prisma 7, ExcelJS advisory).
