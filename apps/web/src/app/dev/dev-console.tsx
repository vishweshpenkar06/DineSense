"use client";

import type { Snapshot, SnapshotTable, TableState } from "@dinesense/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STREAM_EVENT_NAMES = [
  "table.updated",
  "task.created",
  "task.updated",
  "order.created",
  "order.updated",
  "menu.availability",
  "camera.status",
  "bill.updated",
] as const;

const TABLE_STATE_OPTIONS: TableState[] = [
  "free",
  "occupied",
  "needs_order",
  "ordered",
  "food_ready",
  "dining",
  "bill_requested",
  "needs_cleaning",
];

const STATE_LABELS: Record<TableState, string> = {
  free: "Free",
  occupied: "Seated",
  needs_order: "Waiting to order",
  ordered: "Ordered",
  food_ready: "Food ready",
  dining: "Dining",
  bill_requested: "Bill requested",
  needs_cleaning: "Needs cleaning",
};

const STATE_CARD: Record<TableState, string> = {
  free: "border-emerald-500/30 bg-emerald-500/5",
  occupied: "border-amber-400/40 bg-amber-400/10",
  needs_order: "border-red-500/60 bg-red-500/15",
  ordered: "border-sky-500/40 bg-sky-500/10",
  food_ready: "border-violet-500/40 bg-violet-500/10",
  dining: "border-slate-600/60 bg-slate-800/40",
  bill_requested: "border-orange-500/40 bg-orange-500/10",
  needs_cleaning: "border-zinc-500/50 bg-zinc-500/10",
};

const BTN =
  "rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_PRIMARY =
  "rounded-md bg-emerald-500 px-2.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";

type StreamLogRow = { id: number; type: string; at: number };
type VisionLogRow = {
  id: string;
  tableLabel: string | null;
  state: string;
  personCount: number;
  confidence: number;
  ts: string;
  receivedAt: string;
};

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function relative(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function istClock(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function ConnectionBadge({ status }: { status: "connecting" | "live" | "reconnecting" }) {
  const styles =
    status === "live"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
      : status === "connecting"
        ? "bg-amber-500/15 text-amber-200 border-amber-500/40"
        : "bg-red-500/15 text-red-300 border-red-500/40";
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting…" : "Reconnecting…";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "live" ? "bg-emerald-400" : status === "connecting" ? "bg-amber-300" : "bg-red-400"
        }`}
      />
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning";
}) {
  const color =
    tone === "danger" ? "text-red-300" : tone === "warning" ? "text-amber-300" : "text-white";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

export default function DevConsolePage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [authState, setAuthState] = useState<"unknown" | "ok" | "unauthorized">("unknown");
  const [stream, setStream] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [streamLog, setStreamLog] = useState<StreamLogRow[]>([]);
  const [visionLog, setVisionLog] = useState<VisionLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shiftSeconds, setShiftSeconds] = useState(180);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/snapshot", { cache: "no-store" });
      if (response.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      if (!response.ok) throw new Error(`Snapshot failed (${response.status})`);
      const data = (await response.json()) as Snapshot;
      setSnapshot(data);
      setAuthState("ok");
      setClockOffset(new Date(data.serverNow).getTime() - Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load snapshot");
    }
  }, []);

  useEffect(() => {
    void refresh();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 150);
    };

    const source = new EventSource("/api/stream");
    source.addEventListener("open", () => {
      setStream("live");
      void refresh();
    });
    source.addEventListener("hello", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { serverNow: string };
        setClockOffset(new Date(data.serverNow).getTime() - Date.now());
      } catch {
        // ignore malformed hello
      }
      setStream("live");
    });
    const onEvent = (event: Event) => {
      const message = event as MessageEvent;
      try {
        const payload = JSON.parse(message.data) as { type?: string };
        setStreamLog((previous) =>
          [
            { id: Date.now() + Math.random(), type: payload.type ?? "event", at: Date.now() },
            ...previous,
          ].slice(0, 25),
        );
      } catch {
        // ignore malformed payload
      }
      scheduleRefresh();
    };
    for (const name of STREAM_EVENT_NAMES) source.addEventListener(name, onEvent);
    source.onerror = () => setStream("reconnecting");

    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      source.close();
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    if (stream !== "reconnecting" || authState === "unauthorized") {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => void refresh(), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [stream, authState, refresh]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch("/api/dev/events", { cache: "no-store" });
      if (!active || !response.ok) return;
      const data = (await response.json()) as { events: VisionLogRow[] };
      setVisionLog(data.events);
    };
    void load();
    const timer = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const post = useCallback(
    async (url: string, body: unknown, label: string) => {
      setBusy(label);
      setError(null);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 401) setAuthState("unauthorized");
        if (!response.ok) {
          setError(data?.error ?? `Request failed (${response.status})`);
          return;
        }
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Request failed");
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const serverNowMs = now + clockOffset;

  const stats = useMemo(() => {
    if (!snapshot) return { waiting: 0, active: 0, escalated: 0, orders: 0 };
    return {
      waiting: snapshot.tables.filter((table) => table.state === "needs_order").length,
      active: snapshot.tables.filter((table) => table.session !== null).length,
      escalated: snapshot.tasks.filter((task) => task.escalatedAt !== null).length,
      orders: snapshot.orders.length,
    };
  }, [snapshot]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (authState === "unauthorized") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <h1 className="text-xl font-semibold">Sign in to continue</h1>
          <p className="mt-2 text-sm text-slate-400">
            The dev console needs an admin session.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
        <p className="text-sm text-slate-400">Loading the floor plan…</p>
      </main>
    );
  }

  const camerasReported = snapshot.cameras.some((camera) => camera.status !== "UNKNOWN");
  const offlineCameras = snapshot.cameras.filter((camera) => camera.status === "OFFLINE");
  const waitingTables = snapshot.tables.filter((table) => table.state === "needs_order");

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            DineSense <span className="text-slate-500">/ Phase 1 dev console</span>
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {snapshot.me.name} · {snapshot.me.role.toLowerCase()} · decision window{" "}
            {snapshot.settings.DECIDE_WINDOW_S}s
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ConnectionBadge status={stream} />
          <span
            className={`rounded-full border px-2.5 py-1 font-medium ${
              snapshot.worker.healthy
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/40 bg-red-500/10 text-red-300"
            }`}
          >
            Worker {snapshot.worker.healthy ? "healthy" : "stale"}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-slate-300">
            {istClock(serverNowMs)} IST
          </span>
          <button type="button" onClick={signOut} className={BTN}>
            Sign out
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {offlineCameras.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Camera offline ({offlineCameras.map((camera) => camera.name).join(", ")}) — set tables
          manually until the stream is back.
        </div>
      ) : !camerasReported ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          No camera heartbeat yet — start the vision service or use Sit / Leave below.
        </div>
      ) : null}

      {waitingTables.length > 0 ? (
        <div className="animate-pulse rounded-xl border-2 border-red-500 bg-red-500/15 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-red-300">
            Waiter alert
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {waitingTables
              .map((table) => `Table ${table.label} (${table.zone.name}) is waiting to order`)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Waiting to order" value={stats.waiting} tone={stats.waiting > 0 ? "danger" : "default"} />
        <Stat label="Active visits" value={stats.active} />
        <Stat label="Open tasks" value={snapshot.tasks.length} tone={stats.escalated > 0 ? "danger" : "default"} />
        <Stat label="Kitchen tickets" value={stats.orders} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                Tables
              </h2>
              {snapshot.tables.some((table) => table.state === "needs_order") ? (
                <span className="animate-pulse rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-semibold text-red-200">
                  A table is waiting for a waiter
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {snapshot.tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  serverNowMs={serverNowMs}
                  busy={busy}
                  onPost={post}
                />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Active kitchen tickets
            </h2>
            {snapshot.orders.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                No tickets yet. Seat a table and press “Test order”.
              </p>
            ) : (
              <div className="space-y-2">
                {snapshot.orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        KOT {order.kotNumber}
                        <span className="ml-2 text-sm font-normal text-slate-400">
                          {order.tableLabel ?? "Takeaway"} · {order.zoneName ?? "—"}
                        </span>
                      </p>
                      <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-200">
                        {order.status}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-sm text-slate-300">
                      {order.items
                        .filter((item) => !item.cancelled)
                        .map((item) => (
                          <li key={item.id}>
                            {item.qty} × {item.name} ({item.variant})
                            {item.note ? (
                              <span className="ml-1 text-amber-300">· {item.note}</span>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Waiter tasks
            </h2>
            {snapshot.tasks.length === 0 ? (
              <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                Nothing pending. Good service.
              </p>
            ) : (
              <div className="space-y-2">
                {snapshot.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`rounded-xl border px-3 py-3 ${
                      task.escalatedAt
                        ? "border-red-500/60 bg-red-500/10"
                        : task.status === "SNOOZED"
                          ? "border-amber-500/30 bg-amber-500/5"
                          : "border-slate-800 bg-slate-900/50"
                    }`}
                  >
                    <p className="text-sm font-medium">{task.text}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      P{task.priority} · {task.status.toLowerCase()} ·{" "}
                      {relative(task.createdAt, serverNowMs)}
                      {task.escalatedAt ? " · escalated" : ""}
                      {task.status === "SNOOZED" && task.snoozedUntil
                        ? ` · back ${istClock(new Date(task.snoozedUntil).getTime())}`
                        : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={BTN}
                        disabled={busy !== null || task.status !== "OPEN"}
                        onClick={() => void post(`/api/tasks/${task.id}/action`, { action: "ack" }, task.id)}
                      >
                        Acknowledge
                      </button>
                      <button
                        type="button"
                        className={BTN}
                        disabled={busy !== null || task.status !== "OPEN"}
                        onClick={() => void post(`/api/tasks/${task.id}/action`, { action: "snooze" }, task.id)}
                      >
                        Snooze 5m
                      </button>
                      <button
                        type="button"
                        className={BTN}
                        disabled={busy !== null}
                        onClick={() => void post(`/api/tasks/${task.id}/action`, { action: "done" }, task.id)}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Simulation
            </h2>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
              <p className="text-xs text-slate-400">
                Jump time forward to test the 3-minute rule without waiting.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {[60, 120, 180].map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    className={BTN}
                    disabled={busy !== null}
                    onClick={() => void post("/api/dev/time-skip", { seconds }, `shift-${seconds}`)}
                  >
                    −{seconds}s
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={3600}
                  value={shiftSeconds}
                  onChange={(event) => setShiftSeconds(Number(event.target.value) || 1)}
                  className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                />
                <button
                  type="button"
                  className={BTN}
                  disabled={busy !== null}
                  onClick={() => void post("/api/dev/time-skip", { seconds: shiftSeconds }, "shift-custom")}
                >
                  Shift
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                The worker ticks every 5s, so allow a few seconds for a shifted deadline to fire.
              </p>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Live events
          </h2>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
            {streamLog.length === 0 ? (
              <li className="text-slate-500">Waiting for events…</li>
            ) : (
              streamLog.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-emerald-300">{event.type}</span>
                  <span className="text-slate-500">{relative(new Date(event.at).toISOString(), now)}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Vision events
          </h2>
          <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
            {visionLog.length === 0 ? (
              <li className="text-slate-500">No camera events yet.</li>
            ) : (
              visionLog.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold text-slate-200">{event.tableLabel ?? "—"}</span>{" "}
                    <span className={event.state === "occupied" ? "text-amber-300" : "text-sky-300"}>
                      {event.state}
                    </span>{" "}
                    <span className="text-slate-500">
                      ({event.personCount} {event.personCount === 1 ? "person" : "people"})
                    </span>
                  </span>
                  <span className="text-slate-500">{relative(event.ts, serverNowMs)}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}

function TableCard({
  table,
  serverNowMs,
  busy,
  onPost,
}: {
  table: SnapshotTable;
  serverNowMs: number;
  busy: string | null;
  onPost: (url: string, body: unknown, label: string) => Promise<void>;
}) {
  const mutedUntilMs = table.visionMutedUntil ? new Date(table.visionMutedUntil).getTime() : 0;
  const isMuted = mutedUntilMs > serverNowMs;
  const deadlineMs = table.session?.decisionDeadline
    ? new Date(table.session.decisionDeadline).getTime()
    : null;
  const countdown =
    table.state === "occupied" && deadlineMs !== null && deadlineMs !== undefined
      ? Math.ceil((deadlineMs - serverNowMs) / 1000)
      : null;

  return (
    <article className={`rounded-xl border p-3 ${STATE_CARD[table.state]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xl font-semibold leading-none">{table.label}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-400">
            {table.zone.name} · {table.zone.isAc ? "AC" : "Non-AC"} · {table.seats} seats
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5 text-[11px] font-medium text-slate-200">
          {STATE_LABELS[table.state]}
        </span>
      </div>

      <div className="mt-2 flex min-h-[20px] items-center justify-between text-xs">
        {countdown !== null ? (
          <span className={`font-mono text-sm ${countdown <= 30 ? "text-red-300" : "text-amber-200"}`}>
            auto-alert {formatCountdown(countdown)}
          </span>
        ) : table.session ? (
          <span className="text-slate-400">
            since {istClock(new Date(table.session.occupiedAt).getTime())}
          </span>
        ) : (
          <span className="text-slate-500">no visit</span>
        )}
        {isMuted ? (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
            camera ignored
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className={BTN}
          disabled={busy !== null}
          onClick={() => void onPost("/api/dev/simulate", { tableId: table.id, state: "occupied" }, `occupy-${table.id}`)}
        >
          Someone sat
        </button>
        <button
          type="button"
          className={BTN}
          disabled={busy !== null}
          onClick={() => void onPost("/api/dev/simulate", { tableId: table.id, state: "empty" }, `empty-${table.id}`)}
        >
          Table left
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy !== null || table.session === null}
          onClick={() => void onPost("/api/dev/order", { tableId: table.id }, `order-${table.id}`)}
        >
          Test order
        </button>
        <button
          type="button"
          className={BTN}
          disabled={busy !== null}
          onClick={() =>
            void onPost(
              `/api/tables/${table.id}/vision-mute`,
              { seconds: isMuted ? 0 : 300 },
              `mute-${table.id}`,
            )
          }
        >
          {isMuted ? "Unmute camera" : "Mute camera"}
        </button>
      </div>

      <label className="mt-2 block text-[11px] text-slate-400">
        Manual override
        <select
          value=""
          disabled={busy !== null}
          onChange={(event) => {
            const value = event.target.value as TableState;
            if (!value) return;
            void onPost(`/api/tables/${table.id}/state`, { state: value }, `state-${table.id}`);
          }}
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
        >
          <option value="">Set status…</option>
          {TABLE_STATE_OPTIONS.map((state) => (
            <option key={state} value={state}>
              {STATE_LABELS[state]}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}
