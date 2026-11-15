"use client";

import type { Snapshot, SnapshotTable, SnapshotTask } from "@dinesense/core";
import { ConnectionBadge } from "@/components/connection-badge";
import { ShiftBar } from "@/components/shift-bar";
import { errorMessage, postJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import { readPending, removePending, type PendingOrder } from "@/lib/offline-orders";
import { useShift } from "@/lib/shift";
import {
  STATE_LABEL,
  STATE_STYLE,
  elapsedLabel,
  formatCountdown,
} from "@/lib/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BTN =
  "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 disabled:opacity-40";
const BTN_PRIMARY =
  "rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";

export default function WaiterPage() {
  const router = useRouter();
  const { snapshot, stream, unauthorized, error, refresh, serverNowMs, setError } =
    useSnapshotLive();
  const shift = useShift();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [lastZone, setLastZone] = useState<string | null>(null);
  const seenAlerts = useRef(new Set<string>());

  useEffect(() => {
    setLastZone(window.localStorage.getItem("dinesense.lastZone"));
  }, []);

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

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (unauthorized) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-5">
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <h1 className="text-xl font-semibold">Sign in to start</h1>
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

  if (!snapshot) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Floor</h1>
          <ConnectionBadge status={stream} />
        </header>
        {pending.length > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            <span>
              {pending.length} order{pending.length === 1 ? "" : "s"} queued — will send when online
            </span>
            <button type="button" className={BTN} onClick={() => void flushPending()} disabled={busy !== null}>
              Retry now
            </button>
          </div>
        ) : null}
        <p className="text-sm text-slate-400">
          Loading the floor…
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

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-28">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Floor</h1>
          <p className="text-xs text-slate-400">
            {snapshot.me.name} · waiter · {snapshot.tables.filter((table) => table.session).length} active
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge status={stream} />
          <Link href="/waiter/cameras" className={BTN}>
            Cameras
          </Link>
          <button type="button" onClick={() => void signOut()} className={BTN}>
            Out
          </button>
        </div>
      </header>

      <ShiftBar unlocked={shift.unlocked} screenAwake={shift.screenAwake} onStart={() => void shift.start()} />

      {snapshot.settings.SHADOW_MODE ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Pilot shadow mode — the paper pad is still the backup. Use the app as normal.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <span>
            {pending.length} order{pending.length === 1 ? "" : "s"} queued — will send when online
          </span>
          <button type="button" className={BTN} onClick={() => void flushPending()} disabled={busy !== null}>
            Retry now
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl border-2 border-slate-700 bg-slate-900/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Next up</p>
        {nextTask ? (
          <>
            <p className="mt-1 text-2xl font-semibold">{nextTask.text}</p>
            <p className="mt-1 text-sm text-slate-400">
              {nextTask.status.toLowerCase()} · waiting {elapsedLabel(nextTask.createdAt, serverNowMs)}
              {nextTask.escalatedAt ? " · escalated" : ""}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
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
                  Mark served
                </button>
              ) : null}
              <button
                type="button"
                className={BTN}
                disabled={busy !== null || nextTask.status !== "OPEN"}
                onClick={() => void taskAction(nextTask, "ack")}
              >
                Acknowledge
              </button>
              <button
                type="button"
                className={BTN}
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
          </>
        ) : (
          <p className="mt-2 text-lg text-slate-300">Nothing pending. Good service.</p>
        )}

        {following.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-slate-800 pt-2 text-sm text-slate-400">
            {following.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{task.text}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-emerald-300"
                  disabled={busy !== null}
                  onClick={() => void taskAction(task, "done")}
                >
                  Done
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <button
        type="button"
        className={`${BTN_PRIMARY} w-full py-3 text-base`}
        disabled={busy !== null}
        onClick={() =>
          void act("parcel", async () => {
            const created = await postJson<{ sessionId: string }>("/api/sessions", {
              kind: "TAKEAWAY",
            });
            router.push(`/waiter/order?sessionId=${created.sessionId}`);
          })
        }
      >
        + New parcel
      </button>

      {[...zones.entries()].map(([zoneId, zone]) => (
        <section key={zoneId} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            {zone.name} <span className="text-slate-600">· {zone.isAc ? "AC" : "Non-AC"}</span>
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
    <article className={`rounded-xl border p-3 ${STATE_STYLE[table.state]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xl font-semibold leading-none">{table.label}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {countdown !== null
              ? `alert in ${formatCountdown(countdown)}`
              : table.session
                ? `seated ${elapsedLabel(table.session.occupiedAt, serverNowMs)}`
                : "no visit"}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-0.5 text-[11px]">
          {STATE_LABEL[table.state]}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        {table.session ? (
          <Link
            href={`/waiter/order?tableId=${table.id}`}
            className={`${BTN_PRIMARY} flex-1 text-center`}
          >
            Order
          </Link>
        ) : (
          <button type="button" className={`${BTN_PRIMARY} flex-1`} disabled={busy !== null} onClick={onSeat}>
            Seat table
          </button>
        )}
        {table.session && table.state === "food_ready" ? (
          <button type="button" className={BTN} disabled={busy !== null} onClick={onServe}>
            Served
          </button>
        ) : null}
      </div>

      {table.session ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-slate-400">More actions</summary>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={BTN}
              disabled={busy !== null || table.state === "bill_requested" || table.state === "needs_cleaning"}
              onClick={onBill}
            >
              Request bill
            </button>
            <button
              type="button"
              className={BTN}
              disabled={busy !== null}
              onClick={muted ? onUnmute : onMute}
            >
              {muted ? "Unmute camera" : "Ignore camera 5m"}
            </button>
            <select
              className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2"
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
              className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2"
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
