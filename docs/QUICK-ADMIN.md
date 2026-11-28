# Admin — quick guide

1. Sign in with the **admin password** (not a PIN) and open `/admin`.
2. **Overview:** Today/Yesterday/Last 7 days/This month; earnings, bills, average
   bill, orders, items, top/bottom dishes, floor/hour/payment splits and timings.
   **Export CSV** downloads the same range.
3. **Menu:** categories, items, variants, per-floor prices and availability, or
   import CSV/XLSX. Prices in the file are rupees.
4. **Floors & tables:** names, AC flag, surcharge, tables, seats and cameras.
5. **Cameras:** add RTSP, test, disable, calibrate zones. Draw around the table
   plus chairs on the raw image; save each table. 11 zones take ~10–20 minutes.
6. **Staff:** create waiters/chefs/receptionists with PINs; reset credentials or
   deactivate people. The owner account uses a password.
7. **Settings:** the decision timer (default 180 s), GST rate/mode, service charge, HSN, bill prefix, business-day start, and restaurant profile with GSTIN, FSSAI and UPI QR.
8. **Day close:** count cash, see expected UPI/card and record the variance.
9. **Health:** database, worker, disk, last backup, clock skew, cameras; download diagnostics. Nightly backups are in `backups/` (14 days).
10. **Pilot:** enable Shadow mode in Settings during the pilot; open **Pilot** daily to
   review manual corrections, camera/staff mismatches and write the fix list.
   Tune the seated/empty windows from the Cameras tuning log. See docs/PILOT.md.
11. Updates: `./scripts/update.sh`; backup first (the script does it for you). The dev console and demo role bypass are disabled in the shipped install.
