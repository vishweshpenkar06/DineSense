# DineSense installation (mini PC)

This guide takes a blank Ubuntu mini PC to a working restaurant system. Budget
about 45–90 minutes, most of it drawing camera zones and importing the menu.

## What you need

- Ubuntu 22.04/24.04 mini PC with 4+ cores, 8 GB RAM, 128 GB SSD (see
  `docs/HARDWARE.md`).
- The mini PC connected to the venue router by Ethernet (preferred) or Wi-Fi, on
  the same network as staff phones and cameras.
- Staff phones/tablet on that network, with **AP/client isolation disabled**.
- A DHCP reservation for the mini PC (or note its LAN IP).
- Camera RTSP URLs (substream is enough), and the menu CSV/XLSX.
- A UPS is strongly recommended.

## 1. Install

```bash
git clone <your-repo> /opt/dinesense
cd /opt/dinesense
sudo ./install.sh
```

The installer:

1. installs Docker Engine + Compose if missing and enables Docker at boot;
2. creates `.env` with random Postgres/session/encryption/vision secrets;
3. builds and starts Postgres, migrations, web, worker, vision and Caddy;
4. creates a minimal database with an **owner/admin password** (printed once);
5. exports Caddy's root certificate to `caddy-root.crt`;
6. schedules a nightly 03:00 backup (14-day retention) when cron is available.

Save the printed admin password and the URL (`https://<LAN-IP>`).

## 2. Trust the HTTPS certificate on staff devices

The default setup uses Caddy's internal CA. On every phone/tablet, install
`caddy-root.crt` as a trusted root certificate once. Detailed steps for Android,
iOS, Windows and macOS are in `docs/HTTPS.md`.

> Plain `https://<LAN-IP>` shows a certificate warning until the root CA is
> installed. The app still works, but PWA install/wake lock require a trusted
> certificate.

## 3. First-run setup wizard

Open `https://<LAN-IP>/login`, choose **Admin password**, sign in, and follow
`/setup`:

1. Restaurant name, address, phone, GSTIN and bill footer.
2. The standard two-floor layout (Ground G1–G5 non-AC, First F1–F6 AC) or your
   own floors/tables.
3. Cameras: add the RTSP URL, **Test connection**, save, then **Calibrate** each
   table zone on the raw frame.
4. Menu: import the CSV/XLSX (`category,item,local_name,variant,price_ground,
   price_first,veg,needs_kitchen`).
5. Staff: create the waiter, chef and receptionist with 4–6 digit PINs.
6. Timers/tax: the decision timer defaults to **180 seconds**; set the tax rate
   and mode the accountant gave you.
7. Run the guided test (seated → alert → order → ready → served → paid) and
   finish. The test data removes itself.

Hand out the quick guides in `docs/QUICK-*.md`.

## Day-to-day operations

```bash
docker compose ps                 # are all services up?
docker compose logs -f web worker # tail app logs
./scripts/healthcheck.sh          # 200 from /api/health
./scripts/backup.sh               # manual backup
./scripts/diagnostics.sh          # bundle logs/health for support
```

Health: Admin → **Health** shows the database, worker tick, disk space, last
backup, clock skew and camera status. The reception screen warns when the system
is unhealthy.

### Power cuts

Everything has `restart: unless-stopped`; Postgres data and deadlines are on disk.
After power returns, start the stack (or let it start on boot):

```bash
docker compose up -d
./scripts/healthcheck.sh
```

Timers survive because deadlines are in the database. The owner can log in and
continue; no reconfiguration is needed.

## Backups

- Nightly at 03:00 to `backups/dinesense-*.dump` (custom pg_dump format).
- 14 days retained automatically.
- Optional second copy: set `BACKUP_USB_PATH=/media/usb/dinesense` and/or
  `BACKUP_RCLONE_REMOTE=remote:dinesense` in `.env`.
- Restore:

  ```bash
  ./scripts/restore.sh backups/dinesense-20261115-030000.dump
  ```

  The restore stops web/worker/vision, replaces all data, and restarts. It asks
  for confirmation. Test a restore before the first real service day.

## Updates

```bash
./scripts/update.sh
```

It backs up first, pulls, rebuilds, migrates, restarts and runs a health check.
If health fails, the script rolls the code back to the previous commit and tells
you to restore the pre-update backup if the migration changed data.

## Troubleshooting

| Symptom | Check |
|---|---|
| Phones cannot open the site | Same Wi-Fi? AP/client isolation off? Correct LAN IP (`./scripts/lan-ip.sh`)? |
| Certificate warning | Install `caddy-root.crt` (docs/HTTPS.md) |
| Cameras offline | RTSP URL reachable from the mini PC? Admin → Cameras → Test; `docker compose logs vision` |
| No alerts | Waiter tapped “Start shift” (sound on)? Worker healthy in Admin → Health? |
| Login fails | Use the admin password printed at install; reset a staff PIN in Admin → Staff |
| Printer layout | Browser print dialog; choose 80 mm or A4 in the reception screen |
| Disk full | Admin → Health; remove old backups or expand the SSD |

## Security notes

- Secrets live in `.env` (mode 600), never in the app or browser.
- RTSP URLs are encrypted at rest and only decrypted for the vision service.
- LAN-only by default; no cloud dependency. Optional remote access is a later
  add-on (Tailscale/Cloudflare Tunnel) and must be documented separately.
- Set `COOKIE_SECURE=true` in `.env` after staff only use HTTPS, then
  `docker compose up -d` (HTTP `:3000` logins will stop working by design).
- Change the admin password from Admin → Staff after handover.
