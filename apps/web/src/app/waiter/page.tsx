"use client";

import { Brand, BrandMark } from "@/components/brand";
import { ConnectionBadge } from "@/components/connection-badge";
import { ShiftBar } from "@/components/shift-bar";
import type { SnapshotTable, SnapshotTask } from "@dinesense/core";
import { errorMessage, postJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import { readPending, removePending, type PendingOrder } from "@/lib/offline-orders";
import {
  getNotificationState,
  requestNotificationPermission,
  type NotificationState,
} from "@/lib/notifications";
import { useShift } from "@/lib/shift";
import {
  STATE_DOT,
  STATE_LABEL,
  STATE_STYLE,
  elapsedLabel,
  formatCountdown,
} from "@/lib/ui";
import {
  ArrowRight,
  Bell,
  BellOff,
  BellRing,
  Camera,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LogOut,
  Plus,
  RefreshCw,
  UtensilsCrossed,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-slate-600 hover:bg-raised disabled:opacity-40";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-canvas transition hover:bg-[#efc05e] disabled:bg-raised disabled:text-faint disabled:hover:bg-raised";
const BTN_TABLE =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2.5 text-sm font-semibold text-accent transition hover:bg-accent/[0.12] disabled:opacity-40";

export default function WaiterPage() {
  const router = useRouter();
  const { snapshot, stream, unauthorized, error, refresh, serverNowMs, setError } = useSnapshotLive();
  const shift = useShift();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [lastZone, setLastZone] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<NotificationState>("default");
  const seenAlerts = useRef(new Set<string>());

  useEffect(() => {
    setLastZone(window.localStorage.getItem("dinesense.lastZone"));
    setNotificationState(getNotificationState());
  }, []);

  async function enableNotifications() {
    if (notificationState === "granted") {
      toast.success("Pickup notifications are on");
      return;
    }
    if (notificationState === "insecure") {
      toast.error("System notifications need the secure HTTPS link. Sound and vibration still work.");
      return;
    }
    if (notificationState === "unsupported") {
      toast.error("This browser cannot show pickup notifications. Sound and vibration still work.");
      return;
    }
    if (notificationState === "denied") {
      toast.error("Notifications are blocked. Allow them in your browser settings, then reload.");
      return;
    }
    const next = await requestNotificationPermission();
    setNotificationState(next);
    if (next === "granted") {
      toast.success("Pickup notifications enabled");
    } else if (next === "denied") {
      toast.error("Notifications are blocked. Sound and vibration still work.");
    }
  }

  async function startShift() {
    if (notificationState === "default") {
      const next = await requestNotificationPermission();
      setNotificationState(next);
    }
    await shift.start();
  }

  const flushPending = useCallback(async () => {
    const queued = readPending();
    for (const order of queued) {
      try {
        await postJson("/api/orders", {
          tableId: order.tableId,
          sessionId: order.sessionId,
          clientKey: order.clientKey,
          note: order.note,
          items: order.items,
        });
        removePending(order.clientKey);
      } catch (caught) {
        setError(errorMessage(caught));
        removePending(order.clientKey);
      }
    }
    setPending(readPending());
    await refresh();
  }, [refresh, setError]);

  useEffect(() => {
    const sync = () => setPending(readPending());
    sync();
    window.addEventListener("dinesense:pending", sync);
    const onOnline = () => {
      if (readPending().length > 0) void flushPending();
    };
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => {
      if (readPending().length > 0 && navigator.onLine) void flushPending();
    }, 5000);
    return () => {
      window.removeEventListener("dinesense:pending", sync);
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [flushPending]);

  useEffect(() => {
    if (!snapshot) return;
    let fire = false;
    for (const task of snapshot.tasks) {
      if (task.status === "SNOOZED") continue;
      if (task.type !== "needs_order" && task.type !== "food_ready") continue;
      const key = `${task.id}:${task.lastAlertAt}`;
      if (seenAlerts.current.has(key)) continue;
      seenAlerts.current.add(key);
      fire = true;
    }
    if (fire && shift.unlocked) {
      shift.chime("alert");
      shift.vibrate("alert");
    }
  }, [snapshot, shift]);

  async function act(label: string, run: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await run();
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  const sortedTasks = useMemo(() => {
    if (!snapshot) return [];
    const visible = snapshot.tasks.filter(
      (task) =>
        task.status === "OPEN" ||
        task.status === "ACK" ||
        (task.status === "SNOOZED" &&
          task.snoozedUntil !== null &&
          new Date(task.snoozedUntil).getTime() <= serverNowMs),
    );
    return [...visible].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (lastZone) {
        const aMatch = a.zoneId === lastZone ? 0 : 1;
        const bMatch = b.zoneId === lastZone ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [snapshot, lastZone, serverNowMs]);

  const freeTables = useMemo(
    () =>
      snapshot
        ? snapshot.tables
            .filter((table) => table.state === "free" && table.session === null)
            .map((table) => ({ id: table.id, label: table.label }))
        : [],
    [snapshot],
  );

  async function taskAction(task: SnapshotTask, action: "ack" | "snooze" | "done") {
    await act(`${task.id}-${action}`, async () => {
      await postJson(`/api/tasks/${task.id}/action`, { action });
      if (action === "done" && task.zoneId) {
        window.localStorage.setItem("dinesense.lastZone", task.zoneId);
        setLastZone(task.zoneId);
      }
    });
  }

  async function newParcel() {
    await act("parcel", async () => {
      const created = await postJson<{ sessionId: string }>("/api/sessions", { kind: "TAKEAWAY" });
      router.push(`/waiter/order?sessionId=${created.sessionId}`);
    });
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (unauthorized) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center px-5">
        <div className="w-full rounded-3xl border border-line bg-surface p-8 text-center">
          <BrandMark className="mx-auto h-10 w-10 text-accent" />
          <h1 className="mt-5 font-display text-2xl">Sign in to start</h1>
          <Link href="/login" className={`${BTN_PRIMARY} mt-5 w-full py-3`}>
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-2xl">Floor</h1>
          <ConnectionBadge status={stream} />
        </header>
        {pending.length > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3 text-sm text-accent">
            <span>
              {pending.length} order{pending.length === 1 ? "" : "s"} queued — will send when online
            </span>
            <button type="button" className={BTN} onClick={() => void flushPending()} disabled={busy !== null}>
              Retry now
            </button>
          </div>
        ) : null}
        <p className="flex items-center gap-2 text-sm text-muted">
          <RefreshCw className="h-4 w-4 animate-spin text-accent" /> Loading the floor…
          {stream === "reconnecting"
            ? " No connection right now; queued orders will be sent automatically."
            : ""}
        </p>
      </main>
    );
  }

  const zones = new Map<string, { name: string; isAc: boolean; tables: SnapshotTable[] }>();
  for (const table of snapshot.tables) {
    const zone = zones.get(table.zone.id) ?? {
      name: table.zone.name,
      isAc: table.zone.isAc,
      tables: [],
    };
    zone.tables.push(table);
    zones.set(table.zone.id, zone);
  }

  const nextTask = sortedTasks[0] ?? null;
  const following = sortedTasks.slice(1, 4);
  const activeCount = snapshot.tables.filter((table) => table.session).length;

  return (
    <main className="mx-auto min-h-[100dvh] max-w-5xl px-4 pb-32 pt-5 sm:px-6 sm:pb-10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 w-8 shrink-0 text-accent sm:hidden" />
          <Brand compact className="hidden sm:inline-flex" />
          <span className="hidden h-7 w-px bg-line sm:block" />
          <div className="min-w-0">
            <h1 className="font-display text-[1.7rem] font-medium leading-none tracking-[-0.02em] sm:text-3xl">
              Floor
            </h1>
            <p className="mt-1 truncate text-xs text-muted">
              {snapshot.me.name} · {activeCount} active {activeCount === 1 ? "table" : "tables"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ConnectionBadge status={stream} />
          <button
            type="button"
            onClick={() => void enableNotifications()}
            title={
              notificationState === "granted"
                ? "Pickup notifications are on"
                : notificationState === "denied"
                  ? "Notifications are blocked in browser settings"
                  : notificationState === "insecure" || notificationState === "unsupported"
                    ? "System notifications need HTTPS"
                    : "Enable pickup notifications"
            }
            aria-label={
              notificationState === "granted"
                ? "Pickup notifications are on"
                : "Enable pickup notifications"
            }
            className={`flex h-9 w-9 items-center justify-center rounded-xl border bg-surface transition sm:w-auto sm:gap-1.5 sm:px-3 ${
              notificationState === "granted"
                ? "border-jade/30 text-jade"
                : "border-line text-muted hover:text-ink"
            }`}
          >
            {notificationState === "granted" ? (
              <BellRing className="h-4 w-4" />
            ) : notificationState === "denied" ||
              notificationState === "insecure" ||
              notificationState === "unsupported" ? (
              <BellOff className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            <span className="hidden text-sm sm:inline">
              {notificationState === "granted" ? "Alerts on" : "Alerts"}
            </span>
          </button>
          <Link
            href="/waiter/cameras"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:text-ink sm:w-auto sm:gap-1.5 sm:px-3"
          >
            <Camera className="h-4 w-4" />
            <span className="hidden text-sm sm:inline">Cameras</span>
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:text-ink sm:w-auto sm:gap-1.5 sm:px-3"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden text-sm sm:inline">Out</span>
          </button>
        </div>
      </header>

      <div className="mt-5">
        <ShiftBar unlocked={shift.unlocked} screenAwake={shift.screenAwake} onStart={() => void startShift()} />
      </div>

      {snapshot.settings.SHADOW_MODE ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-xs leading-relaxed text-accent">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Pilot shadow mode — the paper pad is still the backup. Use the app as normal.
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-2xl border border-coral/30 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
          {error}
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3 text-sm text-accent">
          <span>
            {pending.length} order{pending.length === 1 ? "" : "s"} queued — will send when online
          </span>
          <button type="button" className={BTN} onClick={() => void flushPending()} disabled={busy !== null}>
            Retry now
          </button>
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Next up
          </span>
          {nextTask ? (
            <span className="text-[11px] text-faint">
              P{nextTask.priority} · waiting {elapsedLabel(nextTask.createdAt, serverNowMs)}
              {nextTask.escalatedAt ? " · escalated" : ""}
            </span>
          ) : null}
        </div>

        {nextTask ? (
          <div className="p-5 sm:p-6">
            <h2 className="max-w-2xl text-[1.45rem] font-semibold leading-snug tracking-[-0.015em] text-ink sm:text-[1.7rem]">
              {nextTask.text}
            </h2>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <Clock3 className="h-3.5 w-3.5" />
              {nextTask.status.toLowerCase()}
              {nextTask.escalatedAt ? <span className="text-coral"> · escalated</span> : null}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {nextTask.type === "food_ready" && nextTask.sessionId ? (
                <button
                  type="button"
                  className={`${BTN_PRIMARY} col-span-2 py-3 text-base`}
                  disabled={busy !== null}
                  onClick={() =>
                    void act(`serve-${nextTask.id}`, () =>
                      postJson(`/api/sessions/${nextTask.sessionId}/served`),
                    )
                  }
                >
                  <CheckCircle2 className="h-4 w-4" /> Mark served
                </button>
              ) : null}
              <button
                type="button"
                className={`${BTN_PRIMARY} py-2.5`}
                disabled={busy !== null || nextTask.status !== "OPEN"}
                onClick={() => void taskAction(nextTask, "ack")}
              >
                Acknowledge
              </button>
              <button
                type="button"
                className={`${BTN} py-2.5`}
                disabled={busy !== null || nextTask.status !== "OPEN"}
                onClick={() => void taskAction(nextTask, "snooze")}
              >
                Snooze 5m
              </button>
              <button
                type="button"
                className={`${BTN} col-span-2`}
                disabled={busy !== null}
                onClick={() => void taskAction(nextTask, "done")}
              >
                Done
              </button>
            </div>

            {following.length > 0 ? (
              <ul className="mt-5 space-y-1 border-t border-line pt-3">
                {following.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate text-sm text-muted">{task.text}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs font-medium text-accent transition hover:text-[#efc05e]"
                      disabled={busy !== null}
                      onClick={() => void taskAction(task, "done")}
                    >
                      Done
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-4 px-5 py-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jade/10 text-jade">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-medium text-ink">Nothing pending. Good service.</p>
              <p className="mt-0.5 text-sm text-muted">New tables and ready food will appear here.</p>
            </div>
          </div>
        )}
      </section>

      <div className="mt-8 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium tracking-[-0.02em] sm:text-[1.7rem]">Tables</h2>
          <p className="mt-0.5 text-xs text-muted">Tap a table to take an order or update its state.</p>
        </div>
        <button
          type="button"
          className={`${BTN} hidden shrink-0 sm:inline-flex`}
          disabled={busy !== null}
          onClick={() => void newParcel()}
        >
          <Plus className="h-3.5 w-3.5" /> New parcel
        </button>
      </div>

      <div className="mt-4 space-y-7">
        {[...zones.entries()].map(([zoneId, zone]) => (
          <section key={zoneId}>
            <div className="mb-2.5 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">{zone.name}</h3>
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                {zone.isAc ? "AC" : "Non-AC"}
              </span>
              <span className="text-[11px] text-faint">
                {zone.tables.filter((table) => table.session).length} seated
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {zone.tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  serverNowMs={serverNowMs}
                  busy={busy}
                  freeTables={freeTables.filter((candidate) => candidate.id !== table.id)}
                  onSeat={() =>
                    act(`seat-${table.id}`, () =>
                      postJson(`/api/tables/${table.id}/state`, { state: "occupied" }),
                    )
                  }
                  onBill={() =>
                    table.session &&
                    act(`bill-${table.id}`, () =>
                      postJson(`/api/sessions/${table.session?.id}/request-bill`),
                    )
                  }
                  onServe={() =>
                    table.session &&
                    act(`serve-${table.id}`, () =>
                      postJson(`/api/sessions/${table.session?.id}/served`),
                    )
                  }
                  onMute={() =>
                    act(`mute-${table.id}`, () =>
                      postJson(`/api/tables/${table.id}/vision-mute`, { seconds: 300 }),
                    )
                  }
                  onUnmute={() =>
                    act(`unmute-${table.id}`, () =>
                      postJson(`/api/tables/${table.id}/vision-mute`, { seconds: 0 }),
                    )
                  }
                  onMove={(targetId) =>
                    table.session &&
                    act(`move-${table.id}`, () =>
                      postJson(`/api/sessions/${table.session?.id}/move`, { tableId: targetId }),
                    )
                  }
                  onStatus={(state) =>
                    act(`state-${table.id}`, () =>
                      postJson(`/api/tables/${table.id}/state`, { state }),
                    )
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          <Link href="/waiter" className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium text-accent">
            <UtensilsCrossed className="h-5 w-5" /> Floor
          </Link>
          <Link href="/waiter/cameras" className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium text-muted">
            <Camera className="h-5 w-5" /> Cameras
          </Link>
          <button
            type="button"
            onClick={() => void newParcel()}
            className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium text-muted"
          >
            <Plus className="h-5 w-5" /> Parcel
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium text-muted"
          >
            <LogOut className="h-5 w-5" /> Out
          </button>
        </div>
      </nav>
    </main>
  );
}

function TableCard({
  table,
  serverNowMs,
  busy,
  freeTables,
  onSeat,
  onBill,
  onServe,
  onMute,
  onUnmute,
  onMove,
  onStatus,
}: {
  table: SnapshotTable;
  serverNowMs: number;
  busy: string | null;
  freeTables: Array<{ id: string; label: string }>;
  onSeat: () => void;
  onBill: () => void;
  onServe: () => void;
  onMute: () => void;
  onUnmute: () => void;
  onMove: (targetId: string) => void;
  onStatus: (state: string) => void;
}) {
  const deadline = table.session?.decisionDeadline
    ? new Date(table.session.decisionDeadline).getTime()
    : null;
  const countdown =
    table.state === "occupied" && deadline !== null
      ? Math.ceil((deadline - serverNowMs) / 1000)
      : null;
  const muted =
    table.visionMutedUntil !== null && new Date(table.visionMutedUntil).getTime() > serverNowMs;

  return (
    <article className={`rounded-2xl border p-4 ${STATE_STYLE[table.state]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[table.state]}`} />
          <p className="truncate text-[1.35rem] font-semibold leading-none tracking-[-0.01em]">
            {table.label}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-canvas/40 px-2.5 py-1 text-[10px] font-medium text-muted">
          {STATE_LABEL[table.state]}
        </span>
      </div>

      <p className={`mt-2 flex items-center gap-1.5 text-[11px] ${countdown !== null ? "text-accent" : "text-muted"}`}>
        {countdown !== null ? <Clock3 className="h-3 w-3" /> : null}
        {countdown !== null
          ? `order alert in ${formatCountdown(countdown)}`
          : table.session
            ? `seated ${elapsedLabel(table.session.occupiedAt, serverNowMs)}`
            : "no visit"}
      </p>

      <div className="mt-3 flex gap-2">
        {table.session ? (
          <Link href={`/waiter/order?tableId=${table.id}`} className={`${BTN_TABLE} flex-1`}>
            Order <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <button type="button" className={`${BTN_TABLE} flex-1`} disabled={busy !== null} onClick={onSeat}>
            Seat table
          </button>
        )}
        {table.session && table.state === "food_ready" ? (
          <button type="button" className={BTN} disabled={busy !== null} onClick={onServe}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Served
          </button>
        ) : null}
      </div>

      {table.session ? (
        <details className="group mt-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-faint transition hover:text-muted">
            More actions
            <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
          </summary>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={BTN}
              disabled={busy !== null || table.state === "bill_requested" || table.state === "needs_cleaning"}
              onClick={onBill}
            >
              Request bill
            </button>
            <button type="button" className={BTN} disabled={busy !== null} onClick={muted ? onUnmute : onMute}>
              {muted ? "Unmute camera" : "Ignore camera 5m"}
            </button>
            <select
              className="col-span-2 rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs text-ink"
              value=""
              disabled={busy !== null}
              onChange={(event) => {
                if (event.target.value) onMove(event.target.value);
              }}
            >
              <option value="">Move to table…</option>
              {freeTables.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <select
              className="col-span-2 rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs text-ink"
              value=""
              disabled={busy !== null}
              onChange={(event) => {
                if (event.target.value) onStatus(event.target.value);
              }}
            >
              <option value="">Set status…</option>
              {(["occupied", "needs_order", "dining", "bill_requested", "needs_cleaning", "free"] as const).map(
                (state) => (
                  <option key={state} value={state}>
                    {STATE_LABEL[state]}
                  </option>
                ),
              )}
            </select>
          </div>
        </details>
      ) : null}
    </article>
  );
}
