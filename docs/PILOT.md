# Pilot and shadow mode

The software is ready, but the cameras and the staff are new. Run the pilot in four
stages; the owner keeps paper as the legal backup until sign-off.

## Stage 0 — before service (1–2 hours)

- Complete the setup wizard (`/setup`) and the guided test run.
- Create all staff PINs and install the PWA on their devices.
- Print the quick guides; decide who keeps the paper pad.
- Set **Admin → Settings → Shadow mode** ON. Staff screens show an amber “pilot
  shadow mode” banner; orders, alerts and bills work normally.

## Stage 1 — shadow mode (2–3 days)

- Staff use the app as normal **and** keep the paper pad/bills as the source of truth.
- Every day, open **Admin → Pilot**, choose the business day, and review:
  - manual corrections by table;
  - camera/staff mismatches (for example the camera said empty but staff seated the
    table);
  - abandoned tables and waiting-to-order alerts.
- Write the day's complaints, repeated mistakes and ideas in **Daily pilot note /
  fix list**. It is saved per business day.
- Do not change timers yet; collect evidence first.

## Stage 2 — tune thresholds

- Open **Admin → Cameras → Tuning log** (counts and debounced states, no images).
- Look for tables with frequent false “empty” or frequent walk-by occupancy.
- Adjust in **Admin → Settings**:
  - `SEATED_CONFIRM_S` (default 20 s): raise if walk-bys trigger, lower only if
    tables take too long to appear.
  - `EMPTY_CONFIRM_S` (default 60 s): raise if empty tables are freed while people
    are still there.
- Re-run the camera test from Admin → Pilot notes and watch the next day's review.
  Do not tune more than once a day; compare like with like.

## Stage 3 — live with paper backup (one week)

- The app becomes the working system for orders, kitchen and bills, but keep paper
  as the backup.
- Every day: check the pilot review, the exceptions on the reception screen, and
  compare the day's bills with the cash book.
- Fix items/variants/floors that are wrong in Admin; use **Recent detections** to
  confirm camera placement.
- Log every complaint in the daily note.

## Stage 4 — sign-off

Review the week with the owner and staff. Sign off only when:

- [ ] No table waited past 2 minutes without a waiter being alerted.
- [ ] The chef's board matched the paper chits every day.
- [ ] Bills and split payments matched the cash book; tax lines are correct.
- [ ] The pilot review shows manual corrections falling, not rising.
- [ ] Staff can run a normal service without asking for help.
- [ ] The owner has exported at least one report and knows where backups live.

After sign-off, set shadow mode OFF, keep the nightly backups, and schedule a
monthly review of the health page and camera tuning log.

## What “shadow mode” changes

Only visibility and process: the app still creates alerts, orders and bills. The
amber banner reminds staff that paper is the fallback. It does not suppress the
2-minute timer or any kitchen/reception action.
