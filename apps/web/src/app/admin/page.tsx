"use client";

import type {
  AdminCameraDto,
  AdminFloorsDto,
  AdminMenuDto,
  AdminSettingsDto,
  AdminStaffDto,
  ReportSummaryDto,
} from "@dinesense/core";
import { ConnectionBadge } from "@/components/connection-badge";
import { errorMessage, getJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CamerasPanel } from "./cameras-panel";
import { FloorsPanel } from "./floors-panel";
import { HealthPanel } from "./health-panel";
import { PilotPanel } from "./pilot-panel";
import { MenuPanel } from "./menu-panel";
import { SettingsPanel } from "./settings-panel";
import { StaffPanel } from "./staff-panel";
import { BTN, BTN_PRIMARY, CARD, duration, money, type Run } from "./ui";

type Tab = "overview" | "menu" | "floors" | "cameras" | "staff" | "settings" | "health" | "pilot";

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

  const isAdmin = snapshot?.me.role === "ADMIN";

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
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-5">
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <h1 className="text-xl font-semibold">Admin sign in</h1>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (snapshot && !isAdmin) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-5 text-center">
        <p className="text-sm text-slate-400">This area is for the owner/admin account.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-xs text-slate-400">
            {snapshot?.me.name ?? "Owner"} · configuration, menu and reports
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge status={stream} />
          <Link href="/dev" className={BTN}>
            Dev console
          </Link>
          <button type="button" className={BTN} onClick={() => void signOut()}>
            Out
          </button>
        </div>
      </header>

      {snapshot?.settings.SHADOW_MODE ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Pilot shadow mode is ON — keep the paper pad as the source of truth while you compare
          the app with daily service.
        </div>
      ) : null}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        {(["overview", "menu", "floors", "cameras", "staff", "settings", "pilot", "health"] as Tab[]).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setTab(entry)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${
              tab === entry ? "bg-emerald-500 text-slate-950" : "text-slate-300"
            }`}
          >
            {entry === "floors" ? "Floors & tables" : entry[0].toUpperCase() + entry.slice(1)}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      {tab === "overview" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              ["today", "Today"],
              ["yesterday", "Yesterday"],
              ["last7", "Last 7 days"],
              ["month", "This month"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={preset === value ? BTN_PRIMARY : BTN}
                onClick={() => {
                  setPreset(value);
                  void loadReport(`preset=${value}`);
                }}
              >
                {label}
              </button>
            ))}
            <button type="button" className={preset === "" ? BTN_PRIMARY : BTN} onClick={() => setPreset("")}>
              Custom
            </button>
            {preset === "" ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
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
              <a className={BTN} href={`/api/reports/export.csv?${reportQuery}`}>
                Export CSV
              </a>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Earnings", report ? money(report.earningsPaise) : "—"],
              ["Bills", report?.billsCount ?? 0],
              ["Average bill", report ? money(report.averageBillPaise) : "—"],
              ["Orders", report?.ordersCount ?? 0],
              ["Items ordered", report?.itemsCount ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className={CARD}>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Business days {report?.from ?? "—"} → {report?.to ?? "—"} (05:00 IST cutoff by default,
            adjustable in Settings).
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable title="Top dishes" dishes={report?.topDishes ?? []} />
            <ReportTable title="Bottom dishes" dishes={report?.bottomDishes ?? []} />
            <div className={CARD}>
              <h2 className="text-sm font-semibold text-slate-300">Earnings by floor</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {report?.byFloor.map((floor) => (
                  <li key={`${floor.zoneName}-${floor.isAc}`} className="flex justify-between">
                    <span>
                      {floor.zoneName}{" "}
                      <span className="text-slate-500">({floor.isAc ? "AC" : "Non-AC"})</span>
                    </span>
                    <span className="font-mono">
                      {money(floor.earningsPaise)} · {floor.billsCount} bills
                    </span>
                  </li>
                ))}
                {!report?.byFloor.length ? <li className="text-slate-500">No paid bills.</li> : null}
              </ul>
            </div>
            <div className={CARD}>
              <h2 className="text-sm font-semibold text-slate-300">By hour / payment</h2>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <ul className="space-y-1">
                  {report?.byHour.map((hour) => (
                    <li key={hour.hour} className="flex justify-between">
                      <span>{String(hour.hour).padStart(2, "0")}:00</span>
                      <span className="font-mono">{money(hour.earningsPaise)}</span>
                    </li>
                  ))}
                </ul>
                <ul className="space-y-1">
                  {report?.byPayment.map((payment) => (
                    <li key={payment.method} className="flex justify-between">
                      <span>{payment.method}</span>
                      <span className="font-mono">{money(payment.amountPaise)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className={`${CARD} lg:col-span-2`}>
              <h2 className="text-sm font-semibold text-slate-300">Operations</h2>
              <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                <p>Seated → first order: {duration(report?.operations.avgSeatedToFirstOrderS ?? null)}</p>
                <p>Order → ready: {duration(report?.operations.avgOrderToReadyS ?? null)}</p>
                <p>Alert response: {duration(report?.operations.avgAlertResponseS ?? null)}</p>
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
      {tab === "staff" ? (
        <StaffPanel staff={staff} busy={busy} run={run} onChanged={loadStaff} />
      ) : null}
      {tab === "settings" && settingsData ? (
        <SettingsPanel data={settingsData} busy={busy} run={run} onChanged={loadSettings} />
      ) : null}
      {tab === "pilot" ? <PilotPanel /> : null}
      {tab === "health" ? <HealthPanel /> : null}
    </main>
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
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      {dishes.length > 0 ? (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {dishes.map((dish) => (
              <tr key={`${title}-${dish.name}-${dish.variant}`}>
                <td className="py-1">
                  {dish.name} <span className="text-slate-500">({dish.variant})</span>
                </td>
                <td className="text-right font-mono">{dish.qty}</td>
                <td className="text-right font-mono">{money(dish.amountPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No sales in this range.</p>
      )}
    </div>
  );
}
