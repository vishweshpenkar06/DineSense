# HTTPS on the restaurant LAN

The native Android APK uses HTTP on the restaurant Wi-Fi and needs no CA. This guide is for browser and PWA devices.
The PWA needs a **secure context** on phones and tablets. `http://192.168.x.x` is
not secure: installation, wake lock and vibration will not work. `http://localhost`
is treated as secure by browsers, so it is fine for development on the mini PC.

Two supported paths:

1. **Real domain (preferred, no certificate to install).** Point a DNS A record at
   the mini PC's LAN IP and let Caddy obtain a publicly trusted certificate. The
   standard Caddy image supports HTTP-01 (requires the site to be reachable from the
   internet) or DNS-01 (requires a Caddy build with your DNS provider module).
   Use `deploy/Caddyfile.acme` instead of `deploy/Caddyfile`.

2. **Caddy internal CA (works fully offline).** Caddy issues a certificate for a
   local name such as `dinesense.local`; each phone installs Caddy's root
   certificate once. This is the default Phase 3 setup.

## Using the hotel/restaurant Wi-Fi

The shipped Wi-Fi name is **The Chinese Chef**. Staff phones join that SSID; the mini PC should be wired to the same router.

The mini PC and staff phones must be on the **same network**. That is the easiest
option when the venue already has Wi-Fi:

- Connect the mini PC by Ethernet to the venue router (preferred), or to the venue
  SSID. Give it a **DHCP reservation** so its IP never changes.
- Staff phones/tablets join the same SSID.
- **Turn off AP/client isolation** (“guest isolation”, “client separation”) on the
  router. Many hotel guest networks block device-to-device traffic, which would make
  the app unreachable even though both devices show full Wi-Fi.
  If the venue will not change it, add a small dedicated router/AP for the staff
  devices and the mini PC; connect its WAN port to the venue network.
- Captive portals are fine: complete the portal once per device. The app itself
  never needs internet, only the local Wi-Fi link.
- Give the cameras a path to the mini PC too (same LAN or a wired camera VLAN).

Without a local DNS entry, use the mini PC's LAN IP directly:

```bash
./scripts/lan-ip.sh        # prints the IP and the .env lines
```

Put `SITE_ADDRESS=<that IP>` in `.env`, then recreate Caddy. Caddy's internal CA
issues a certificate for the IP; the `default_sni` option in `deploy/Caddyfile` is
required because browsers connecting to an IP do not send SNI. Install the root
certificate once on every phone.

If the venue can add a DNS entry, a name such as `dinesense.local` is nicer (and
survives an IP change); use that in `SITE_ADDRESS` and point it at the mini PC.

## Internal CA setup

1. In `.env`:

   ```bash
   SITE_ADDRESS=dinesense.local   # or the mini PC's current LAN IP
   COOKIE_SECURE=true
   ```

   `COOKIE_SECURE=true` makes session cookies HTTPS-only. Keep it `false` while you
   still need to test over `http://<mini-pc>:3000`.

2. If using a name, make `dinesense.local` resolve to the mini PC on the LAN. Easiest:
   a static DNS entry on the router. mDNS/avahi works on many networks but is not
   guaranteed on Android. If using the IP, no DNS step is needed.

3. Start Caddy and export the root certificate:

   ```bash
   docker compose up -d caddy
   ./scripts/export-ca.sh
   ```

4. Install `caddy-root.crt` as a trusted root CA on every phone/tablet:

   - **Android:** Settings → Security → More security settings → Install a
     certificate → CA certificate → install `caddy-root.crt`. (Menu names vary by
     vendor.)
   - **iOS/iPadOS:** send the file to the device (AirDrop/email), tap it → Settings →
     Profile Downloaded → Install. Then Settings → General → About → Certificate
     Trust Settings → enable full trust for the DineSense root.
   - **Windows:** double-click the file → Install Certificate → Local Machine →
     Place all certificates in Trusted Root Certification Authorities.
   - **macOS:** Keychain Access → System → drag the file in → double-click → Trust →
     Always Trust.

5. Open `https://192.168.1.43` (or the reserved LAN IP) on each device, sign in,
   and use “Add to Home Screen”. The app then runs standalone.

   **No CA on the phone yet?** Caddy also serves the app over plain HTTP on port 80
   (`http://<LAN-IP>/`) and the root certificate at `http://<LAN-IP>/ca.crt`. That
   lets a phone open the app immediately; use HTTPS for PWA install and for
   `COOKIE_SECURE=true`. The fallback is LAN-only and does not redirect to HTTPS. The native APK uses this fallback and needs no CA.

6. Verify from a machine on the LAN:

   ```bash
   curl --cacert caddy-root.crt https://192.168.1.43/api/health
   openssl s_client -connect 192.168.1.43:443 -servername 192.168.1.43 </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer
   ```

## Important

- The internal CA and certificate live in the `caddy-data` Docker volume. **Do not
  delete that volume** after installing the root certificate on devices, or every
  device has to trust a new CA.
- Caddy is configured to disable response buffering for the SSE stream; do not
  remove `flush_interval -1`.
- With `COOKIE_SECURE=true`, logins over plain HTTP (`:3000`) stop working. That is
  expected; use HTTPS for staff devices.
- Phase 7 adds an installer that creates random secrets and can configure the
  domain/DNS challenge automatically.
