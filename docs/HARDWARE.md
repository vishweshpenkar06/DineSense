# Hardware and placement guide (for the owner)

## Mini PC

- 4+ CPU cores (Intel i3/i5 N100/N305 class or better), 8–16 GB RAM.
- 128 GB SSD minimum; the app, model and 14 days of backups fit comfortably.
- Wired Ethernet to the router. Wi-Fi only if a cable is impossible.
- A **UPS** sized for the PC + router (10–15 minutes is enough to ride out short
  cuts). Enable “restore power on AC return” in the BIOS.
- Ubuntu 22.04/24.04, static DHCP reservation, NTP enabled (`timedatectl set-ntp true`).

## Network

- Mini PC, staff phones/tablet and cameras on the same LAN/subnet.
- **Disable AP/client isolation** on the venue router. Guest networks often block
  device-to-device traffic; if it cannot be disabled, add a small dedicated
  router/AP for staff devices and the mini PC.
- Cover both floors and the kitchen with Wi-Fi; 5 GHz APs are fine. The mini PC
  should be wired even if staff are on Wi-Fi.
- No internet is required for service. Internet is only for install/updates and
  optional off-site backups.

## Cameras

- Existing IP/CCTV cameras with RTSP output; a 640–1280 px **substream** per
  camera is enough.
- One camera may cover several tables; a table belongs to one camera.
- Mount high (2.5–3 m), angled down so the whole table **and chairs** are visible.
- Avoid strong backlight/windows behind the table; avoid a table hidden by a
  pillar or another table.
- Use a dedicated camera VLAN or the same LAN; the mini PC needs a route to RTSP.
- No audio is used, no video is recorded; only table states and counts are sent to
  the app. The annotated image is in memory for the staff view.
- Put up a notice: “This restaurant uses cameras for table management.”

## Phones/tablet

- Android phone(s) for waiters, a tablet or small monitor for the chef, a
  laptop/desktop for reception.
- Install the Caddy root certificate once, then “Add to Home Screen”. Use a
  charging stand for the chef tablet; the app requests a wake lock.
- A small Bluetooth speaker is not required; the phone's speaker is enough.

## Printing

- Any printer that the browser can see; the reception screen has 80 mm thermal
  and A4 print layouts. For 80 mm, set the printer driver's paper width to 80 mm
  and margins to none in the print dialog.
- ESC/POS direct printing is not part of v1.
