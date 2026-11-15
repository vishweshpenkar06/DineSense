# HTTPS on the restaurant LAN

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

## Internal CA setup

1. In `.env`:

   ```bash
   SITE_ADDRESS=dinesense.local
   COOKIE_SECURE=true
   ```

   `COOKIE_SECURE=true` makes session cookies HTTPS-only. Keep it `false` while you
   still need to test over `http://<mini-pc>:3000`.

2. Make `dinesense.local` resolve to the mini PC on the LAN. Easiest: a static DNS
   entry on the router. mDNS/avahi works on many networks but is not guaranteed on
   Android.

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

5. Open `https://dinesense.local` on each device, sign in, and use “Add to Home
   Screen”. The app then runs standalone.

6. Verify from a machine on the LAN:

   ```bash
   curl -k https://dinesense.local/api/health
   openssl s_client -connect dinesense.local:443 -servername dinesense.local </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer
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
