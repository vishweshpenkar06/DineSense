# DineSense — Product, Scale-Up and Commercialisation Plan

> Goal: turn the current DineSense pilot into a product that can be installed at many
> independent restaurants with only per-restaurant configuration, not code changes.
>
> Current build: working web app + signed Android shell APK. This document is the
> product/engineering roadmap after the app exists; it is not a UI-only plan. The UI
> phases remain in `docs/UI-REDESIGN.md`.

---

## 1. Executive recommendation

Sell a **supported on-premise appliance** to independent table-service restaurants in
India first, with an optional cloud management layer.

- **Wedge:** 30–120 cover restaurants, 1–3 floors, table service, dine-in + takeaway,
  Indo-Chinese / multi-cuisine / café.
- **Model:** one-time software licence + annual support/updates + optional hardware kit.
  Add a cloud management subscription later for remote support, backups and multi-outlet
  reporting.
- **Keep local-first:** the restaurant must keep taking orders and printing bills when
  the internet is down. The mini PC is authoritative; the cloud is management only.
- **Do not chase:** full multi-tenant SaaS, delivery aggregators, inventory, loyalty,
  customer ordering and chain HQ before the single-site product is paid-for and stable.

**Verdict:** the shipped install is ready for a single-site pilot. Billing compliance, UPI QR, day close, production flags and the native APK are in place. The remaining gaps for a mass-market product are native printing, licensing, fleet operations and multi-outlet support.

---

## 2. What already exists (sellable foundation)

- Local-first Postgres/worker/web/vision stack in Docker Compose.
- Waiter PWA, chef board, reception billing, admin dashboard, setup wizard, camera
  calibration, health/diagnostics, pilot tooling.
- Engine tests: core 121, acceptance 122, vision 36, Playwright 9.
- 120-item AC/non-AC menu; per-floor prices; Half/Full and Dry/Gravy variants.
- Offline order queue, audit log, camera privacy, nightly backups, power-cut recovery.
- Theme foundation, shared components, component gallery, install prompt, PWA shortcuts.
- Native Android shell APK:
  - Signed release APK at `dist/DineSense.apk`.
  - Package `com.dinesense.app`, version 1.2.0 (build 3), Android 8+.
  - First-run server setup shows Wi-Fi **The Chinese Chef** and pre-fills `http://192.168.1.43`; app-icon shortcuts for Waiter/Kitchen/Reception/Owner and Server settings. No CA is needed for the APK.
  - Native pickup notifications, keep-screen-awake, Android print bridge, file import,
    downloads, back-button handling, LAN HTTP/HTTPS with user-CA trust.
  - Source under `apps/android`; APK build in `docs/APK.md`.

---

## 3. Target customer and product editions

### Ideal first customer

- Independent, owner-operated restaurant with 30–120 covers.
- One to three floors/sections, table service, takeaway counter.
- Existing Wi-Fi and a place for a mini PC/UPS.
- Uses a thermal printer at the counter and a kitchen printer or screen.
- Wants ownership of data and does not want a monthly cloud POS.
- Will pay for installation, training and local support.

### Editions

| Edition | Customer | Contents |
|---|---|---|
| **DineSense Table** | No cameras | Floors, table service, waiter/chef/reception, billing, printer, UPI QR, reports |
| **DineSense Vision** | Wants automatic table detection | Table + cameras, auto seat/empty, timers, pilot tooling |
| **DineSense Chain** | 2–20 outlets | Central menu/pricing, consolidated reports, remote management, multi-outlet support |

### Add-ons

- Extra tablet, printer, camera kit, UPS.
- On-site installation/training.
- Offsite encrypted backup.
- UPI/payment reconciliation.
- Commissioning report, menu setup, branding.

---

## 4. Gap map: pilot → sellable to many restaurants

| Priority | Area | Today | Required |
|---|---|---|---|
| **P0** | Production lockdown | `DEMO_ALLOW_ALL_ROLES`, dev console/routes, demo PINs, HTTP fallback, demo camera mode | Separate production build; no dev routes/bypass; HTTPS-only; no default staff credentials; demo mode explicit |
| **P0** | Trusted HTTPS/mobile | Caddy internal CA + manual CA install + HTTP fallback | Trusted public DNS/cert or native shell that trusts a bundled CA; no per-phone CA installation; stable hostname |
| **P0** | Android delivery | Signed WebView APK built now | Installable APK/Play Store/private track, QR server setup, upgrades, supported WebView, remote config |
| **P0** | Billing compliance | One global tax rate; GSTIN; browser print | Per-item/category GST, HSN, inclusive/exclusive, service charge, FSSAI, bill series, GST report, day close/Z |
| **P0** | Printing | Browser 80 mm/A4 print only | Network/USB ESC-POS KOT + bill, kitchen/bar routing, reprints, failure handling, cash drawer |
| **P0** | Payments | Manual cash/UPI/card entry | UPI QR per bill/table, status, split/partial, reconciliation; PSP webhook optional |
| **P0** | Onboarding | Wizard + manual setup/import | Templates, logo/branding, menu import, floor templates, printer/UPI test, staff setup, demo reset, field-tech checklist |
| **P0** | Licensing | None | Offline signed licence, edition flags, trial, renewal, grace, activation |
| **P0** | Fleet operations | `git pull`, local backup only | Signed releases, staged updates/rollback, offsite backup, remote diagnostics/support tunnel, fleet dashboard |
| **P0** | Roles/security | 4 roles, 4-digit PIN, 30-day JWT, no revocation | Manager/cashier/runner, granular permissions, session revocation, lockout, audit UI, HTTPS-only |
| **P0** | Camera-optional health | Offline cameras can mark install degraded | Cameras optional; only real faults degrade; install profile selects vision/no-vision |
| **P1** | Menu depth | Items + variants | Modifiers/add-ons, combos, channel pricing, day-part pricing, menu photos/translations |
| **P1** | Day-close/cash | Reports/CSV | Cash count, drawer reconciliation, Z-report, discounts/voids, staff/table measurement |
| **P1** | Customer flow | Dine-in + takeaway session | Customer name/phone, delivery, waitlist/reservations, QR menu/order/pay |
| **P1** | Language | English UI, INR/IST | Hindi/regional UI and receipt language; configurable currency/tax if outside India |
| **P2** | Multi-outlet/cloud | Single site | Chain dashboard, central menu/price/staff, outlet comparison |
| **P2** | Inventory/loyalty | Not present | Recipes/deduction, purchasing, stock counts, loyalty/CRM |
| **P2** | Delivery integrations | Not present | Swiggy/Zomato/aggregator APIs if the market demands |

---

## 5. Deployment architecture

### Per-restaurant appliance (recommended first)

- One Postgres + web + worker + optional vision stack per restaurant.
- No `restaurantId` column added to every table now: tenant isolation is physical.
- Local backups + encrypted offsite copy.
- Mini PC standard image, auto-start, watchdog, remote-access agent.

### Optional cloud management plane

- Heartbeats: version, licence, disk, backup age, camera health.
- Remote support tunnel with consent and audit.
- Release channel and update orchestration.
- Licence issuance/renewal.
- Offsite backup storage.
- No transaction data by default; restaurant keeps ownership.

### Trust/network

- Preferred mass path: public DNS name per restaurant + publicly trusted certificate
  (DNS-01). The name can point to a private LAN IP; the device needs internet only for
  renewals/updates/support.
- If the restaurant must be fully offline: bundle/pin the local CA in the native shell
  and set the server URL by QR at installation. Do not rely on manual CA installation
  at scale.
- Standardise the router: DHCP reservation/static IP, no AP isolation, NTP, UPS.

---

## 6. Commercial model

### Indicative pricing (validate with 3 pilots)

- **Table:** ₹35k–₹60k licence + ₹8k–₹12k/year AMC, or ₹2,500–₹4,000/month.
- **Vision:** ₹75k–₹1.2L including camera kit, higher AMC.
- **Chain:** per outlet + central dashboard/support fee.
- Hardware at cost + installation margin.
- Paid add-ons: installation/training, extra devices, offsite backup, UPI reconciliation.

### Revenue mix

- Licence + annual support is the base.
- Hardware bundle adds margin but increases support burden.
- Cloud management/backup/chain reporting is the recurring upsell.
- Avoid free lifetime support; price installation/training explicitly.

---

## 7. Per-restaurant configuration (minor customization)

Every restaurant difference should be a setting, template or feature flag — never a
code branch.

| Area | Configurable now | Must become configurable |
|---|---|---|
| Branding | Name, address, phone, GSTIN, bill footer, logo URL | Logo upload, receipt theme, app label/icon, branded APK/PWA |
| Floors/tables | Zones, AC/non-AC, surcharge, table labels/seats, cameras | Templates by restaurant type, table merge/split, QR per table |
| Menu | Categories/items/variants, local names, veg flag, kitchen flag, floor prices, CSV/XLSX import | Modifiers/combos, channel/day-part pricing, tax class, photos, translations, PDF/photo import |
| Tax/billing | Global tax rate/mode, prefix, business-day start | Per-item/category GST, HSN, service charge, FSSAI, bill series per outlet, day close |
| Printing | Browser 80 mm/A4 | ESC/POS printers, templates, kitchen/bar routing, reprints, cash drawer |
| Payments | Cash/UPI/card manual split | UPI QR, PSP reconciliation, tips, refunds, credit |
| Staff | Four fixed roles, PINs, audit | Manager/cashier/runner, permission matrix, session revocation, lockout, shift clock |
| Timers/rules | Decision window, alerts, snooze, ticket colours, empty confirm | Per-zone rules, service-charge rules, channel-specific rules |
| Language | English UI, local item names | Hindi/regional UI, receipt language, multi-currency |
| Integrations | Health/diagnostics/cameras | Offsite backup, accounting export, payment provider, delivery aggregator, loyalty |

### Restaurant templates

Ship templates that preconfigure the most common patterns:
- Indo-Chinese dine-in with AC/non-AC floors.
- Multi-cuisine family restaurant.
- Café/bakery counter service.
- QSR/takeaway with tokens.
- Food-court counter.
- Cloud kitchen (delivery/takeaway, no tables).

---

## 8. P0 launch backlog (do not charge before these)

### Security / production

- Split `development/demo` and `production` builds.
- Remove `DEMO_ALLOW_ALL_ROLES`; production code returns 403 for wrong roles.
- Disable `/dev`, `/dev/ui`, `/api/dev/*` in production.
- Disable HTTP fallback; force HTTPS and secure cookies.
- Remove all demo/staff default PINs; first-run owner password generated.
- Add session revocation, role-change invalidation, PIN lockout, login audit.
- Add security headers, origin checks, dependency scanning.
- Add a factory-reset flow that preserves backups but clears restaurant data.

### Billing and printing

- Tax class per item/category; tax snapshot on order/bill.
- GST invoice fields: GSTIN, HSN, FSSAI, tax breakup, service charge, round-off, bill
  series per fiscal year/outlet.
- Day close, cash count/reconciliation, Z-report, discount/void reports.
- ESC/POS KOT + bill printing with configurable templates, multiple printers and
  reprint/failure handling.
- Receipt logo, footer, terms and duplicate/customer copy.

### Payments

- Per-bill UPI QR/deep link (`upi://pay?...`) with amount and bill reference.
- Manual mark-paid and split/partial payments.
- Optional PSP webhook and reconciliation.
- Cash drawer kick and cashier close.

### Onboarding

- Template chooser, logo upload, menu import, floor import, staff setup.
- Printer test, UPI test, tax test, backup test.
- Branded bill preview and owner training.
- One-click demo reset.
- Field-tech checklist with target time under 2 hours.

### Commercial operations

- Offline signed licence/edition flags/trial.
- Signed release packages and staged update/rollback.
- Encrypted offsite backup + restore UI.
- Remote support tunnel with consent and audit.
- Fleet heartbeat dashboard.
- Signed Android APK/Play Store internal or private distribution.
- Support SOP, WhatsApp/phone escalation, spare device policy.

### Quality

- CI gate for typecheck/tests/build/security.
- Restore drill on a clean appliance.
- Device matrix: Android phones/tablets, WebView versions, printers, network failure.
- Load/soak test: 30 tables, 10 devices, full dinner rush.
- Accessibility pass and real-device waiter/chef review.
- Production migration and rollback tests.

---

## 9. P1 — breadth after first paid installs

- Modifiers/add-ons, combos, channel pricing, menu photos/translations.
- Customer name/phone, delivery/takeaway workflow, waitlist/reservations.
- QR menu/order/pay (optional module; separate security/payment work).
- Day-close dashboards, GST reports, scheduled email/WhatsApp reports.
- Hindi/regional UI and receipt language.
- Manager/cashier roles, approvals for voids/discounts, shift clock.
- Offsite backup enabled by default, retention policy.
- Remote update channels and diagnostics.

---

## 10. P2 — scale and chains

- Multi-outlet cloud dashboard, central menu/pricing, outlet comparison.
- Chain licence management, central staff/roles, consolidated reporting.
- Inventory/recipes/purchasing, supplier and stock counts.
- Loyalty/CRM, WhatsApp campaigns.
- Delivery aggregator integrations.
- Payment gateway/reconciliation at scale.
- Reseller/partner portal and white-label APK/PWA builds.

---

## 11. 90-day execution plan

Assumption: 2 full-stack engineers + 1 field/support person; more/less compresses/extends.

| Window | Focus | Outputs |
|---|---|---|
| **Days 1–14** | P0 security/production lockdown; CI; APK/Play Store internal build | Production build, no demo bypass, signed APK, HTTPS/trust plan, CI gate |
| **Days 15–35** | Billing/GST, printer service, UPI QR, day close, onboarding templates, licence | A restaurant can be configured and take a real paid order/bill on their hardware |
| **Days 36–50** | Fleet ops: remote support, offsite backup/restore, staged updates, health/licence dashboard | You can support a remote restaurant without visiting for every issue |
| **Days 51–70** | Pilot 2–3 restaurants; fix onboarding/billing/printer/network issues | Paid pilot playbook, onboarding time, support baseline, case study |
| **Days 71–90** | Sales kit, pricing, training, spare hardware/SLA, first paid installs | Repeatable sales/install process and first revenue |
| **Parallel** | UI U1–U7 from `docs/UI-REDESIGN.md` | Consistent, accessible staff and owner UI |

### Pilot design

- 3 restaurants: Indo-Chinese, café/multi-cuisine, takeaway-heavy.
- One with cameras, two without.
- Run shadow mode for 2–3 days, then live orders; keep paper backup week one.
- Weekly owner review; log every support issue; measure time-to-onboard.
- Convert pilot to paid AMC; use as reference/case study.

---

## 12. Android app strategy

The current native WebView shell is a real, signed APK and is ready for pilots. For
mass distribution, decide:

### A. Native WebView shell (current, recommended for LAN/offline)

- Pros: can trust a bundled CA, no Chrome/asset-links dependency, full-screen,
  native pickup notifications/print/screen wake, server URL by QR, white-label APK.
- Cons: WebView variation, app updates via APK/store, no true background push.
- Next: QR server configuration, signed release on Play Store/internal track, crash
  reporting, native foreground notification for pickup, WebView version guard.

### B. TWA/Bubblewrap

- Pros: PWA features/service worker, Chrome notifications, no custom WebView.
- Cons: requires trusted public hostname + asset links + Chrome; manual CA/push limits.
- Use if you standardise on a public domain/certificate per restaurant.

**Do not build both fully.** Keep the native shell as the default; provide TWA only for
customers who already have a trusted domain and prefer PWA.

---

## 13. Security and compliance

- **DPDP/privacy:** staff data, customer data, camera notice, retention, vendor access,
  data deletion/export, consent for vision features.
- **Camera privacy:** no frames stored; only events/counts; access audited.
- **GST/legal:** GST invoice fields, HSN, FSSAI, bill series, service charge, record
  retention; have a CA/accountant review before launch.
- **Payments:** do not store card data; UPI/PSP tokenisation; PCI scope minimal.
- **Backups:** encrypted at rest/in transit; restore tested; retention policy.
- **Secrets:** per-install secrets, no demo keys, no default passwords, no committed
  keystores/passwords.
- **Remote support:** consent, audit, time-limited tunnel, least privilege.
- **Licence:** signed offline file; tamper-resistant; grace period; revocation path.

---

## 14. Support and operations

- Support tiers: phone/WhatsApp, remote tunnel, on-site visit, spare tablet/printer.
- SLA: install, response, resolution, replacement hardware.
- Remote diagnostics: one-click bundle, logs, DB health, printer/video state; no secrets
  or video.
- Release channels: stable/beta; staged rollout; rollback; maintenance window.
- Hardware: standard SKU, asset tag, spare stock, RMA process.
- Training: 30–60 minute owner/staff session, quick guides, short videos, in-app help.

---

## 15. Go-to-market

- Landing page + 3-minute demo video + ROI sheet (billing accuracy, staff time, table
  turnaround).
- Demo kit: mini PC + tablet + printer + sample menu; reset button.
- Local resellers/POS dealers; referral commission.
- 14-day paid pilot; installation fee credited to licence.
- Target 3 reference restaurants and a case study before broad outreach.
- Pricing validation through pilots; no lifetime free support.

---

## 16. Sell gate (all must be true)

- [ ] Production build: no dev/demo bypass, HTTPS-only, no default credentials.
- [ ] Real printer test on the restaurant's hardware.
- [ ] Per-item GST/service charge/day close verified with their accountant.
- [ ] UPI QR + cash/card split + reconciliation verified.
- [ ] New restaurant onboarding in under 2 hours with their real menu.
- [ ] Signed APK/Play Store install on every staff device; pickup notification tested.
- [ ] Remote support and licence active.
- [ ] Encrypted offsite backup + clean restore drill.
- [ ] Staff trained; escalation number and quick guides provided.
- [ ] Health dashboard shows real faults only; camera-less profile supported.

---

## 17. Effort and risks

- 2 engineers + field/support: **10–14 weeks** to first paid pilot; 5–6 months to
  chain-ready. Solo developer: 4–6 months to paid pilot.
- Main risks: hardware/network variability, printer/payment integrations, GST edge
  cases, support cost, CA/APK trust, background notification limits, scope creep.
- Mitigations: standard hardware, remote diagnostics, templates, staged rollout,
  accounting review, pilots, feature flags, no custom forks.

---

## 18. Decisions needed from the owner

1. India-first independent restaurants, or broader market?
2. Hardware bundle + licence/AMC, or software-only/subscription?
3. Is cloud management acceptable for licensing/backup/support, or fully offline?
4. Native APK as default, or invest in TWA/public-domain trust?
5. UPI QR + manual confirmation first, or full PSP integration?
6. Single-outlet first, or chains/multi-outlet in the first release?
7. Team, budget and target date for the first paid installation?

**Recommended defaults:** India-first independents; hardware + licence/AMC; local-first
with optional cloud management; native APK default; UPI QR first; single-outlet first;
start P0 now and run 3 paid pilots before broadening the feature set.
