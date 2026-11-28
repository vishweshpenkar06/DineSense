"use client";

import type {
  AdminCameraDto,
  AdminFloorsDto,
  AdminSettingsDto,
  AdminStaffDto,
  MenuImportResult,
} from "@dinesense/core";
import { Brand, BrandMark } from "@/components/brand";
import { ConnectionBadge } from "@/components/connection-badge";
import { errorMessage, getJson, postJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CamerasPanel } from "../admin/cameras-panel";
import { SettingsPanel } from "../admin/settings-panel";
import { StaffPanel } from "../admin/staff-panel";
import { BTN, BTN_PRIMARY, CARD, INPUT, type Run } from "../admin/ui";

type SetupStatus = {
  complete: boolean;
  counts: {
    zones: number;
    tables: number;
    cameras: number;
    categories: number;
    menuItems: number;
    staff: number;
  };
};

const STEPS = ["Profile", "Floors", "Cameras", "Menu", "Staff", "Timers", "Test"] as const;

export default function SetupPage() {
  const router = useRouter();
  const { snapshot, stream, unauthorized } = useSnapshotLive();
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [settingsData, setSettingsData] = useState<AdminSettingsDto | null>(null);
  const [floors, setFloors] = useState<AdminFloorsDto | null>(null);
  const [cameras, setCameras] = useState<AdminCameraDto[]>([]);
  const [staff, setStaff] = useState<AdminStaffDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [demoSteps, setDemoSteps] = useState<Array<{ label: string; detail: string }> | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MenuImportResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const isAdmin = snapshot?.me.role === "ADMIN";

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getJson<SetupStatus>("/api/admin/setup/status"));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);
  const loadSettings = useCallback(async () => {
    try {
      setSettingsData(await getJson<AdminSettingsDto>("/api/admin/settings"));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);
  const loadFloors = useCallback(async () => {
    try {
      setFloors(await getJson<AdminFloorsDto>("/api/admin/floors"));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);
  const loadCameras = useCallback(async () => {
    try {
      setCameras((await getJson<{ cameras: AdminCameraDto[] }>("/api/admin/cameras")).cameras);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);
  const loadStaff = useCallback(async () => {
    try {
      setStaff((await getJson<{ staff: AdminStaffDto[] }>("/api/admin/staff")).staff);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadSettings();
    void loadFloors();
    void loadCameras();
    void loadStaff();
  }, [loadStatus, loadSettings, loadFloors, loadCameras, loadStaff]);

  const run: Run = useCallback(async (action, success) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await loadStatus();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await postJson("/api/admin/restaurant", {
        name: String(form.get("name") ?? ""),
        address: String(form.get("address") ?? ""),
        phone: String(form.get("phone") ?? "") || null,
        registrationType: String(form.get("registrationType") ?? "") || null,
        gstin: String(form.get("gstin") ?? "") || null,
        billFooter: String(form.get("billFooter") ?? "") || null,
      });
      await loadSettings();
    }, "Restaurant profile saved.");
  }

  async function createDefaultLayout() {
    await run(async () => {
      const ground = await postJson<{ id: string }>("/api/admin/floors", {
        entity: "zone",
        name: "Ground Floor",
        isAc: false,
      });
      for (const label of ["G1", "G2", "G3", "G4", "G5"]) {
        await postJson("/api/admin/floors", {
          entity: "table",
          zoneId: ground.id,
          label,
          seats: 4,
        });
      }
      const first = await postJson<{ id: string }>("/api/admin/floors", {
        entity: "zone",
        name: "First Floor",
        isAc: true,
      });
      for (const label of ["F1", "F2", "F3", "F4", "F5", "F6"]) {
        await postJson("/api/admin/floors", {
          entity: "table",
          zoneId: first.id,
          label,
          seats: 4,
        });
      }
      await loadFloors();
    }, "Ground G1–G5 and First F1–F6 created.");
  }

  async function previewImport() {
    if (!importFile) return;
    setPreviewing(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const response = await fetch("/api/admin/menu/import/preview", {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error("Could not preview the file");
      setPreview((await response.json()) as MenuImportResult);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPreviewing(false);
    }
  }

  async function runDemo() {
    await run(async () => {
      const result = await postJson<{
        tableLabel: string;
        steps: Array<{ label: string; detail: string }>;
      }>("/api/admin/setup/demo", {});
      setDemoSteps(result.steps);
      setNotice(`Test run finished on table ${result.tableLabel} and cleaned itself up.`);
      await loadFloors();
    });
  }

  async function finish() {
    await run(async () => {
      await postJson("/api/admin/setup/complete", {});
      router.replace("/admin");
    }, "Setup complete.");
  }

  if (unauthorized) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center px-5">
        <div className="w-full rounded-3xl border border-line bg-surface p-8 text-center">
          <BrandMark className="mx-auto h-10 w-10 text-accent" />
          <h1 className="mt-5 font-display text-2xl">Set up DineSense</h1>
          <Link href="/login" className={`${BTN_PRIMARY} mt-5 w-full py-3`}>
            Sign in
          </Link>
        </div>
      </main>
    );
  }
  if (snapshot && !isAdmin) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center px-5 text-center">
        <p className="text-sm text-muted">The setup wizard is for the owner/admin account.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 w-8 shrink-0 text-accent sm:hidden" />
          <Brand compact className="hidden sm:inline-flex" />
          <span className="hidden h-7 w-px bg-line sm:block" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">Setup</p>
            <h1 className="mt-1 font-display text-[1.65rem] font-medium leading-none tracking-[-0.02em] sm:text-3xl">
              {status?.complete ? "Review your setup" : "Set up your restaurant"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ConnectionBadge status={stream} />
          <Link href="/admin" className={BTN}>
            Exit to admin
          </Link>
        </div>
      </header>

      <div className="mt-4 space-y-2">
        {status?.complete ? (
          <div className="rounded-2xl border border-jade/25 bg-jade/[0.07] px-4 py-3 text-sm text-jade">
            Setup is marked complete. You can re-run the test or finish again.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-coral/30 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-2xl border border-jade/25 bg-jade/[0.07] px-4 py-3 text-sm text-jade">
            {notice}
          </div>
        ) : null}
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition ${
              step === index ? "bg-accent text-canvas" : "text-muted hover:bg-raised hover:text-ink"
            }`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </nav>

      <div className="mt-4 space-y-4">

      {step === 0 ? (
        <form className={CARD} onSubmit={(event) => void saveProfile(event)}>
          <h2 className="text-sm font-semibold text-slate-300">Restaurant profile</h2>
          <p className="mt-1 text-xs text-slate-500">
            This appears on printed bills and the dashboard.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Name
              <input
                name="name"
                defaultValue={settingsData?.restaurant.name ?? ""}
                className={`${INPUT} mt-1`}
                required
              />
            </label>
            <label className="text-xs text-slate-400">
              Phone
              <input
                name="phone"
                defaultValue={settingsData?.restaurant.phone ?? ""}
                className={`${INPUT} mt-1`}
              />
            </label>
            <label className="text-xs text-slate-400 sm:col-span-2">
              Address
              <input
                name="address"
                defaultValue={settingsData?.restaurant.address ?? ""}
                className={`${INPUT} mt-1`}
                required
              />
            </label>
            <label className="text-xs text-slate-400">
              GST registration type
              <select
                name="registrationType"
                defaultValue={settingsData?.restaurant.registrationType ?? ""}
                className={`${INPUT} mt-1`}
                required
              >
                <option value="">Choose one</option>
                <option value="REGULAR">Regular — tax invoice with GST</option>
                <option value="COMPOSITION">Composition — no tax collected</option>
                <option value="UNREGISTERED">Unregistered — no GSTIN</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              GSTIN (required for Regular)
              <input
                name="gstin"
                defaultValue={settingsData?.restaurant.gstin ?? ""}
                className={`${INPUT} mt-1`}
              />
            </label>
            <label className="text-xs text-slate-400">
              Bill footer
              <input
                name="billFooter"
                defaultValue={settingsData?.restaurant.billFooter ?? ""}
                className={`${INPUT} mt-1`}
              />
            </label>
          </div>
          <button type="submit" className={`${BTN_PRIMARY} mt-3`} disabled={busy}>
            Save profile
          </button>
        </form>
      ) : null}

      {step === 1 ? (
        <section className={CARD}>
          <h2 className="text-sm font-semibold text-slate-300">Floors and tables</h2>
          <p className="mt-1 text-xs text-slate-500">
            The standard layout is Ground Floor (non-AC) with G1–G5 and First Floor (AC) with
            F1–F6. You can rename or add tables later in Admin → Floors.
          </p>
          {floors && floors.zones.length > 0 ? (
            <div className="mt-3 space-y-1 text-sm">
              {floors.zones.map((zone) => (
                <p key={zone.id} className="text-slate-300">
                  {zone.name} ({zone.isAc ? "AC" : "Non-AC"}) · {zone.tables.length} tables
                </p>
              ))}
              <Link href="/admin" className="text-xs text-emerald-300">
                Edit floors and tables in Admin
              </Link>
            </div>
          ) : (
            <button type="button" className={`${BTN_PRIMARY} mt-3`} disabled={busy} onClick={() => void createDefaultLayout()}>
              Create the default 2-floor layout
            </button>
          )}
        </section>
      ) : null}

      {step === 2 && floors ? (
        <CamerasPanel cameras={cameras} zones={floors.zones} busy={busy} run={run} onChanged={loadCameras} />
      ) : null}
      {step === 2 && !floors ? <p className="text-sm text-slate-500">Loading floors…</p> : null}

      {step === 3 ? (
        <section className={CARD}>
          <h2 className="text-sm font-semibold text-slate-300">Menu</h2>
          <p className="mt-1 text-xs text-slate-500">
            Import CSV/XLSX with the documented columns, or use Admin → Menu for manual editing.
            {status ? ` Current menu: ${status.counts.categories} categories, ${status.counts.menuItems} items.` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => {
                setImportFile(event.target.files?.[0] ?? null);
                setPreview(null);
              }}
              className="text-sm text-slate-300"
            />
            <button
              type="button"
              className={BTN}
              disabled={!importFile || previewing}
              onClick={() => void previewImport()}
            >
              {previewing ? "Reading…" : "Preview"}
            </button>
            {preview ? (
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busy || preview.groups.length === 0}
                onClick={() =>
                  void run(async () => {
                    await postJson("/api/admin/menu/import", { groups: preview.groups });
                    setPreview(null);
                    setImportFile(null);
                    await loadStatus();
                  }, "Menu imported.")
                }
              >
                Import {preview.groups.length} item groups
              </button>
            ) : null}
            <Link href="/admin" className="text-xs text-emerald-300">
              Open the menu manager
            </Link>
          </div>
          {preview ? (
            <div className="mt-2 space-y-1 text-xs">
              <p className="text-slate-400">
                {preview.rowCount} rows · {preview.groups.length} items · {preview.errors.length}{" "}
                errors · {preview.warnings.length} warnings
              </p>
              {preview.errors.map((entry) => (
                <p key={`e-${entry.rowNumber}-${entry.message}`} className="text-red-300">
                  Row {entry.rowNumber}: {entry.message}
                </p>
              ))}
              {preview.warnings.map((entry) => (
                <p key={`w-${entry.rowNumber}-${entry.message}`} className="text-amber-300">
                  Row {entry.rowNumber}: {entry.message}
                </p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 4 ? (
        <StaffPanel staff={staff} busy={busy} run={run} onChanged={loadStaff} />
      ) : null}

      {step === 5 && settingsData ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            The decision timer is <strong>{settingsData.settings.DECIDE_WINDOW_S} seconds</strong> by
            default. Keep 120 for the 2-minute rule; change it here only if the owner asks.
          </div>
          <SettingsPanel data={settingsData} busy={busy} run={run} onChanged={loadSettings} />
        </div>
      ) : null}
      {step === 5 && !settingsData ? <p className="text-sm text-slate-500">Loading settings…</p> : null}

      {step === 6 ? (
        <section className={CARD}>
          <h2 className="text-sm font-semibold text-slate-300">Test run and finish</h2>
          <p className="mt-1 text-xs text-slate-500">
            This runs a real table through seated → alert → order → ready → served → paid, then
            removes the test order and bill. Open the waiter/chef screens on other devices to watch.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BTN} disabled={busy} onClick={() => void runDemo()}>
              {busy ? "Running…" : "Run the test"}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void finish()}>
              Finish setup
            </button>
          </div>
          {demoSteps ? (
            <ol className="mt-3 space-y-1 text-sm">
              {demoSteps.map((entry, index) => (
                <li key={`${entry.label}-${index}`} className="text-slate-300">
                  <span className="text-emerald-300">{index + 1}. {entry.label}</span> — {entry.detail}
                </li>
              ))}
            </ol>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
            <p>Floors: {status?.counts.zones ?? 0}</p>
            <p>Tables: {status?.counts.tables ?? 0}</p>
            <p>Cameras: {status?.counts.cameras ?? 0}</p>
            <p>Menu items: {status?.counts.menuItems ?? 0}</p>
            <p>Staff: {status?.counts.staff ?? 0}</p>
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between">
        <button
          type="button"
          className={BTN}
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
        >
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className={BTN_PRIMARY} onClick={() => setStep((value) => value + 1)}>
            Next
          </button>
        ) : null}
      </div>
      </div>
    </main>
  );
}
