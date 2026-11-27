"use client";

import type {
  AdminCameraDto,
  AdminFloorsDto,
  AdminMenuDto,
  AdminSettingsDto,
  AdminStaffDto,
  ReportSummaryDto,
} from "@dinesense/core";
import { Brand, BrandMark } from "@/components/brand";
import { ConnectionBadge } from "@/components/connection-badge";
import { errorMessage, getJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import {
  Activity,
  Camera,
  Download,
  ExternalLink,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Map,
  ReceiptText,
  Settings2,
  ShoppingBag,
  UtensilsCrossed,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CamerasPanel } from "./cameras-panel";
import { DayClosePanel } from "./day-close-panel";
import { FloorsPanel } from "./floors-panel";
import { HealthPanel } from "./health-panel";
import { PilotPanel } from "./pilot-panel";
import { MenuPanel } from "./menu-panel";
import { SettingsPanel } from "./settings-panel";
import { StaffPanel } from "./staff-panel";
import { BTN, BTN_PRIMARY, CARD, duration, money, type Run } from "./ui";

type Tab = "overview" | "dayclose" | "menu" | "floors" | "cameras" | "staff" | "settings" | "health" | "pilot";

const DEV_UI = process.env.NEXT_PUBLIC_ENABLE_DEV_UI === "true";

const TABS: Array<{ key: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "dayclose", label: "Day close", icon: Wallet },
  { key: "menu", label: "Menu", icon: UtensilsCrossed },
  { key: "floors", label: "Floors & tables", icon: Map },
  { key: "cameras", label: "Cameras", icon: Camera },
  { key: "staff", label: "Staff", icon: Users },
  { key: "settings", label: "Settings", icon: Settings2 },
  { key: "pilot", label: "Pilot", icon: FlaskConical },
  { key: "health", label: "Health", icon: Activity },
];

export default function AdminPage() {
  const router = useRouter();
  const { snapshot, stream, unauthorized } = useSnapshotLive();
  const [tab, setTab] = useState<Tab>("overview");
  const [menu, setMenu] = useState<AdminMenuDto | null>(null);
  const [floors, setFloors] = useState<AdminFloorsDto | null>(null);
  const [cameras, setCameras] = useState<AdminCameraDto[]>([]);
  const [staff, setStaff] = useState<AdminStaffDto[]>([]);
  const [settingsData, setSettingsData] = useState<AdminSettingsDto | null>(null);
  const [report, setReport] = useState<ReportSummaryDto | null>(null);
  const [preset, setPreset] = useState<string>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);


  const loadReport = useCallback(async (query: string) => {
    try {
      setReport(await getJson<ReportSummaryDto>(`/api/reports/summary?${query}`));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const loadMenu = useCallback(async () => {
    try {
      setMenu(await getJson<AdminMenuDto>("/api/admin/menu"));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const loadFloors = useCallback(async () => {
    try {
      setFloors(await getJson<AdminFloorsDto>("/api/admin/floors"));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const loadCameras = useCallback(async () => {
    try {
      const data = await getJson<{ cameras: AdminCameraDto[] }>("/api/admin/cameras");
      setCameras(data.cameras);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const loadStaff = useCallback(async () => {
    try {
      const data = await getJson<{ staff: AdminStaffDto[] }>("/api/admin/staff");
      setStaff(data.staff);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setSettingsData(await getJson<AdminSettingsDto>("/api/admin/settings"));
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    let active = true;
    getJson<{ complete: boolean }>("/api/admin/setup/status")
      .then((data) => {
        if (active && !data.complete) router.replace("/setup");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    void loadReport("preset=today");
    void loadMenu();
    void loadFloors();
    void loadCameras();
    void loadStaff();
    void loadSettings();
  }, [loadReport, loadMenu, loadFloors, loadCameras, loadStaff, loadSettings]);

  const run: Run = useCallback(async (action, success) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const reportQuery =
    preset !== ""
      ? `preset=${preset}`
      : fromDate && toDate
        ? `from=${fromDate}&to=${toDate}`
        : "";

  if (unauthorized) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center px-5">
        <div className="w-full rounded-3xl border border-line bg-surface p-8 text-center">
          <BrandMark className="mx-auto h-10 w-10 text-accent" />
          <h1 className="mt-5 font-display text-2xl">Admin sign in</h1>
          <Link href="/login" className={`${BTN_PRIMARY} mt-5 w-full py-3`}>
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  const activeTab = TABS.find((entry) => entry.key === tab) ?? TABS[0];

  return (
    <main className="min-h-[100dvh]">
      <div className="mx-auto flex max-w-[1440px] gap-5 px-3 py-4 sm:px-5 lg:px-6 lg:py-5">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-5 flex h-[calc(100dvh-2.5rem)] flex-col rounded-3xl border border-line bg-surface p-4">
            <Brand />
            <p className="mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-faint">Owner console</p>
            <nav className="mt-2 space-y-0.5">
              {TABS.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setTab(entry.key)}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-sm font-medium transition ${
                      tab === entry.key
                        ? "bg-accent text-canvas"
                        : "text-muted hover:bg-raised hover:text-ink"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {entry.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto space-y-2 border-t border-line pt-3">
              <div className="flex items-center justify-between px-2">
                <span className="text-[11px] text-faint">{snapshot?.me.name ?? "Owner"}</span>
                <ConnectionBadge status={stream} />
              </div>
              {DEV_UI ? (
                <Link
                  href="/dev"
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-muted transition hover:bg-raised hover:text-ink"
                >
                  <ExternalLink className="h-4 w-4" /> Dev console
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-muted transition hover:bg-raised hover:text-ink"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark className="h-8 w-8 shrink-0 text-accent lg:hidden" />
              <Brand compact className="hidden sm:inline-flex lg:hidden" />
              <div className="min-w-0">
                <h1 className="font-display text-[1.7rem] font-medium leading-none tracking-[-0.02em] sm:text-3xl">
                  {activeTab.label}
                </h1>
                <p className="mt-1 truncate text-xs text-muted">
                  {snapshot?.me.name ?? "Owner"} · configuration, menu and reports
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 lg:hidden">
              <ConnectionBadge status={stream} />
              {DEV_UI ? (
                <Link href="/dev" className={BTN}>
                  Dev console
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut()}
                aria-label="Sign out"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          <nav className="mt-4 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1 lg:hidden">
            {TABS.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setTab(entry.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ${
                    tab === entry.key ? "bg-accent text-canvas" : "text-muted"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {entry.label}
                </button>
              );
            })}
          </nav>

          {snapshot?.settings.SHADOW_MODE ? (
            <div className="mt-4 rounded-2xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-sm text-accent">
              Pilot shadow mode is ON — keep the paper pad as the source of truth while you compare the
              app with daily service.
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 rounded-2xl border border-coral/30 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mt-3 rounded-2xl border border-jade/25 bg-jade/[0.06] px-4 py-3 text-sm text-jade">
              {notice}
            </div>
          ) : null}

          {tab === "overview" ? (
            <section className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2">
                {[
                  ["today", "Today"],
                  ["yesterday", "Yesterday"],
                  ["last7", "Last 7 days"],
                  ["month", "This month"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      preset === value ? "bg-accent text-canvas" : "text-muted hover:bg-raised hover:text-ink"
                    }`}
                    onClick={() => {
                      setPreset(value);
                      void loadReport(`preset=${value}`);
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    preset === "" ? "bg-accent text-canvas" : "text-muted hover:bg-raised hover:text-ink"
                  }`}
                  onClick={() => setPreset("")}
                >
                  Custom
                </button>
                {preset === "" ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                      className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink"
                    />
                    <span className="text-xs text-faint">to</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                      className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink"
                    />
                    <button
                      type="button"
                      className={BTN}
                      disabled={!fromDate || !toDate}
                      onClick={() => void loadReport(`from=${fromDate}&to=${toDate}`)}
                    >
                      Apply
                    </button>
                  </div>
                ) : null}
                {reportQuery ? (
                  <a className={`${BTN} ml-auto`} href={`/api/reports/export.csv?${reportQuery}`}>
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </a>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
                <div className="col-span-2 rounded-2xl border border-accent/25 bg-accent/[0.06] p-4 md:col-span-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/80">Earnings</p>
                    <Wallet className="h-4 w-4 text-accent/70" />
                  </div>
                  <p className="mt-2 font-display text-[1.7rem] font-medium leading-none tracking-[-0.02em]">
                    {report ? money(report.earningsPaise) : "—"}
                  </p>
                </div>
                {[
                  { label: "Bills", value: report?.billsCount ?? 0, icon: ReceiptText },
                  { label: "Average bill", value: report ? money(report.averageBillPaise) : "—", icon: ShoppingBag },
                  { label: "Orders", value: report?.ordersCount ?? 0, icon: UtensilsCrossed },
                  { label: "Items ordered", value: report?.itemsCount ?? 0, icon: Users },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className={CARD}>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</p>
                      <Icon className="h-3.5 w-3.5 text-faint" />
                    </div>
                    <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { label: "GST collected", value: money(report?.taxPaise ?? 0) },
                  { label: "Service charge", value: money(report?.serviceChargePaise ?? 0) },
                  { label: "Discounts", value: money(report?.discountPaise ?? 0) },
                ].map((row) => (
                  <div key={row.label} className={`${CARD} flex items-center justify-between py-3`}>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                      {row.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>

              <p className="px-1 text-[11px] text-faint">
                Business days {report?.from ?? "—"} → {report?.to ?? "—"} (05:00 IST cutoff by default,
                adjustable in Settings).
              </p>

              <div className="grid gap-3 lg:grid-cols-3">
                <HourlyChart byHour={report?.byHour ?? []} />
                <PaymentsCard byPayment={report?.byPayment ?? []} />
                <ReportTable title="Top dishes" dishes={report?.topDishes ?? []} />
                <ReportTable title="Bottom dishes" dishes={report?.bottomDishes ?? []} />
                <FloorsCard byFloor={report?.byFloor ?? []} />
                <div className={`${CARD} lg:col-span-3`}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">GST breakup</h2>
                    <span className="text-[10px] uppercase tracking-wider text-faint">Paid bills</span>
                  </div>
                  {(report?.taxByRate ?? []).length === 0 ? (
                    <p className="mt-3 text-sm text-faint">No tax collected in this range.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-[10px] uppercase tracking-wider text-faint">
                          <tr>
                            <th className="pb-2">Rate</th>
                            <th className="pb-2 text-right">Taxable</th>
                            <th className="pb-2 text-right">CGST</th>
                            <th className="pb-2 text-right">SGST</th>
                            <th className="pb-2 text-right">Total tax</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(report?.taxByRate ?? []).map((line) => (
                            <tr key={line.ratePercent} className="border-t border-line">
                              <td className="py-2">{line.ratePercent}%</td>
                              <td className="py-2 text-right tabular-nums">{money(line.taxablePaise)}</td>
                              <td className="py-2 text-right tabular-nums">{money(Math.floor(line.taxPaise / 2))}</td>
                              <td className="py-2 text-right tabular-nums">{money(line.taxPaise - Math.floor(line.taxPaise / 2))}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{money(line.taxPaise)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className={`${CARD} lg:col-span-3`}>
                  <h2 className="text-sm font-semibold">Operations</h2>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {[
                      ["Seated → first order", duration(report?.operations.avgSeatedToFirstOrderS ?? null)],
                      ["Order → ready", duration(report?.operations.avgOrderToReadyS ?? null)],
                      ["Alert response", duration(report?.operations.avgAlertResponseS ?? null)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {tab === "menu" && menu ? (
            <MenuPanel menu={menu} busy={busy} run={run} onChanged={loadMenu} />
          ) : null}
          {tab === "floors" && floors ? (
            <FloorsPanel floors={floors} busy={busy} run={run} onChanged={loadFloors} />
          ) : null}
          {tab === "cameras" ? (
            <CamerasPanel
              cameras={cameras}
              zones={floors?.zones ?? []}
              busy={busy}
              run={run}
              onChanged={loadCameras}
            />
          ) : null}
          {tab === "dayclose" ? <DayClosePanel /> : null}
          {tab === "staff" ? (
            <StaffPanel staff={staff} busy={busy} run={run} onChanged={loadStaff} />
          ) : null}
          {tab === "settings" && settingsData ? (
            <SettingsPanel data={settingsData} busy={busy} run={run} onChanged={loadSettings} />
          ) : null}
          {tab === "pilot" ? <PilotPanel /> : null}
          {tab === "health" ? <HealthPanel /> : null}
        </div>
      </div>
    </main>
  );
}

function HourlyChart({ byHour }: { byHour: ReportSummaryDto["byHour"] }) {
  const max = Math.max(1, ...byHour.map((hour) => hour.earningsPaise));
  return (
    <div className={`${CARD} lg:col-span-2`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Earnings by hour</h2>
        <span className="text-[10px] uppercase tracking-wider text-faint">IST</span>
      </div>
      {byHour.length === 0 ? (
        <p className="mt-4 text-sm text-faint">No paid bills in this range.</p>
      ) : (
        <div className="mt-4">
          <div className="flex h-32 items-end gap-1">
            {byHour.map((hour) => (
              <div key={hour.hour} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className="w-full max-w-8 rounded-t-[3px] bg-accent/70 transition group-hover:bg-accent"
                  style={{ height: `${Math.max(4, (hour.earningsPaise / max) * 100)}%` }}
                  title={`${String(hour.hour).padStart(2, "0")}:00 · ${money(hour.earningsPaise)}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {byHour.map((hour, index) => (
              <span key={hour.hour} className="flex-1 text-center text-[9px] text-faint">
                {index % 2 === 0 ? String(hour.hour).padStart(2, "0") : "·"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentsCard({ byPayment }: { byPayment: ReportSummaryDto["byPayment"] }) {
  const total = Math.max(1, byPayment.reduce((sum, payment) => sum + payment.amountPaise, 0));
  return (
    <div className={CARD}>
      <h2 className="text-sm font-semibold">Payments</h2>
      {byPayment.length === 0 ? (
        <p className="mt-4 text-sm text-faint">No payments yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {byPayment.map((payment) => (
            <li key={payment.method}>
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize text-muted">{payment.method.toLowerCase()}</span>
                <span className="font-medium tabular-nums">{money(payment.amountPaise)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-jade/70"
                  style={{ width: `${Math.max(3, (payment.amountPaise / total) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FloorsCard({ byFloor }: { byFloor: ReportSummaryDto["byFloor"] }) {
  const max = Math.max(1, ...byFloor.map((floor) => floor.earningsPaise));
  return (
    <div className={CARD}>
      <h2 className="text-sm font-semibold">Earnings by floor</h2>
      {byFloor.length === 0 ? (
        <p className="mt-4 text-sm text-faint">No paid bills in this range.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {byFloor.map((floor) => (
            <li key={`${floor.zoneName}-${floor.isAc}`}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">
                  {floor.zoneName} <span className="text-faint">({floor.isAc ? "AC" : "Non-AC"})</span>
                </span>
                <span className="font-medium tabular-nums">{money(floor.earningsPaise)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${Math.max(3, (floor.earningsPaise / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportTable({
  title,
  dishes,
}: {
  title: string;
  dishes: ReportSummaryDto["topDishes"];
}) {
  return (
    <div className={CARD}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {dishes.length > 0 ? (
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y divide-line">
            {dishes.map((dish) => (
              <tr key={`${title}-${dish.name}-${dish.variant}`}>
                <td className="py-2">
                  <span className="text-ink">{dish.name}</span>{" "}
                  <span className="text-[11px] text-faint">({dish.variant})</span>
                </td>
                <td className="py-2 text-right text-xs tabular-nums text-muted">{dish.qty}×</td>
                <td className="py-2 text-right text-xs tabular-nums">{money(dish.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-faint">No sales in this range.</p>
      )}
    </div>
  );
}
