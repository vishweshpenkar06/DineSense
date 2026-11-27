# Android app / APK

DineSense has two mobile paths:

1. **Native WebView shell (built here):** `dist/DineSense.apk`. It is a thin Android
   client for the restaurant server and is the easiest way to install the app today.
2. **PWA / TWA:** install the web app from Chrome, or package the PWA as a Trusted Web
   Activity later if a trusted public HTTPS hostname is available.

The server still runs on the mini PC; the APK is not a copy of the database. Staff phones join Wi-Fi **The Chinese Chef**. The setup screen names that Wi-Fi and needs no HTTPS certificate.

## Ready APK

```text
dist/DineSense.apk
package: com.dinesense.app
version: 1.2.0 (3)
minSdk: 26 (Android 8)
targetSdk: 35
signing: release keystore on this machine
wifi: The Chinese Chef
```

Install it on the phone (allow install from this source). Connect to Wi-Fi **The Chinese Chef**, open the app, and tap **Open DineSense**. The setup screen is pre-filled with `http://192.168.1.43` and explains which Wi-Fi to use.

Smoke-tested in an Android 15 emulator: server setup, web login, WebView rendering,
native pickup notification and the in-app pickup toast. Physical-phone and printer
checks remain on-device handover checks.

Long-press the app icon for shortcuts:

- Waiter floor
- Kitchen board
- Reception
- Owner
- Server settings

Use **Server settings** whenever the mini PC's IP changes.

## What the native shell provides

- Full-screen WebView with Android back-button handling.
- Server address saved on the device; recoverable from first-run/error screen or the
  app-icon shortcut.
- Native pickup notifications (`Food ready for pickup`), even when the web
  Notification API is unavailable in Android WebView.
- Keep-screen-awake when the waiter starts a shift.
- Android print dialog for bills (the web app's `window.print()` is bridged).
- File picker for menu CSV/XLSX import.
- Downloads for CSV exports and diagnostics.
- External links open in the normal browser.
- Internal CA/user certificates are trusted if installed (HTTPS path).

The shell loads the web app from the server, so web UI changes appear immediately
without rebuilding the APK. Rebuild the APK only when shell/native capabilities change.

## Rebuild

Prerequisites: JDK 17 and Android SDK 35 (command-line tools are enough).

```bash
./scripts/build-android.sh
```

The script uses the local toolchain when available and writes the signed APK to `dist/DineSense.apk`. Gradle output also stays in `apps/android/app/build/outputs/apk/release/`.

Release signing uses `apps/android/keystore.properties` (git-ignored) and the keystore at `~/.local/share/dinesense/dinesense-release.jks` on this machine. **Back up that keystore**; losing it prevents updating an installed APK in place. Do not commit the keystore or passwords.

## Server URL, trust and notifications

- The shell defaults to `http://192.168.1.43`. HTTP works on the LAN and needs no CA. If you change the server IP, update `DEFAULT_SERVER_URL` and rebuild the APK.
- Native notifications require the Android notification permission. The app requests
  it on first launch; if denied, enable it in Android Settings → Apps → DineSense.
- Notifications are local to the running shell; true web-push delivery when the app is
  fully closed is not implemented. Keep the waiter PWA/APK open during service.
- On Android 13+, POST_NOTIFICATIONS is requested by the app.

## PWA / TWA alternative

The web app remains installable from Chrome over HTTPS with the Caddy CA. For a
fullscreen TWA, use `@bubblewrap/cli` with `https://<LAN-IP>/manifest.webmanifest` and
publish `https://<LAN-IP>/.well-known/assetlinks.json` with the TWA package and signing
certificate SHA-256. A template exists at
`apps/web/public/.well-known/assetlinks.json`; replace the placeholder fingerprint.
TWA uses Chrome and preserves PWA notifications/service-worker behavior, but requires
a trusted hostname and asset links.
