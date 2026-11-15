"use client";

import type { KitchenTicketDto, StockVariantDto } from "@dinesense/core";
import { ConnectionBadge } from "@/components/connection-badge";
import { ShiftBar } from "@/components/shift-bar";
import { errorMessage, getJson, postJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import { useShift } from "@/lib/shift";
import { elapsedLabel } from "@/lib/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BTN =
  "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 disabled:opacity-40";
const BTN_PRIMARY =
  "rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";

export default function ChefPage() {
  const router = useRouter();
  const { snapshot, stream, unauthorized, serverNowMs } = useSnapshotLive();
  const shift = useShift();
  const [tickets, setTickets] = useState<KitchenTicketDto[]>([]);
  const [stock, setStock] = useState<StockVariantDto[]>([]);
  const [byDish, setByDish] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const known = useRef<Map<string, string>>(new Map());
  const initialized = useRef(false);

  const loadTickets = useCallback(async () => {
    try {
      const data = await getJson<{ tickets: KitchenTicketDto[] }>("/api/kitchen/tickets");
      setTickets(data.tickets);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const loadStock = useCallback(async () => {
    try {
      const data = await getJson<{ variants: StockVariantDto[] }>("/api/menu/stock");
      setStock(data.variants);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    void loadStock();
    const timer = setInterval(() => void loadTickets(), 5000);
    return () => clearInterval(timer);
  }, [loadTickets, loadStock]);

  useEffect(() => {
    if (snapshot) void loadTickets();
  }, [snapshot, loadTickets]);

  useEffect(() => {
    if (!initialized.current) {
      for (const ticket of tickets) known.current.set(ticket.id, ticket.status);
      if (tickets.length > 0) initialized.current = true;
      return;
    }
    let newTicket = false;
    let cancelledTicket = false;
    for (const ticket of tickets) {
      const previous = known.current.get(ticket.id);
      if (!previous) {
        if (ticket.status !== "CANCELLED") newTicket = true;
      } else if (previous !== "CANCELLED" && ticket.status === "CANCELLED") {
        cancelledTicket = true;
      }
      known.current.set(ticket.id, ticket.status);
    }
    if (newTicket) {
      shift.chime("new");
      shift.vibrate("new");
    }
    if (cancelledTicket) {
      shift.chime("cancel");
      shift.vibrate("cancel");
    }
  }, [tickets, shift.chime, shift.vibrate]);

  async function act(label: string, run: () => Promise<unknown>) {
    setBusy(label);
    try {
      await run();
      await loadTickets();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const columns = useMemo(
    () => [
      { key: "PLACED", title: "New", items: tickets.filter((ticket) => ticket.status === "PLACED") },
      {
        key: "PREPARING",
        title: "Preparing",
        items: tickets.filter((ticket) => ticket.status === "PREPARING"),
      },
      { key: "READY", title: "Ready", items: tickets.filter((ticket) => ticket.status === "READY") },
    ],
    [tickets],
  );

  const cancelled = tickets.filter((ticket) => ticket.status === "CANCELLED");

  const dishes = useMemo(() => {
    const map = new Map<string, { name: string; variant: string; qty: number; tables: Set<string> }>();
    for (const ticket of tickets) {
      if (ticket.status === "CANCELLED") continue;
      for (const item of ticket.items) {
        if (item.cancelled) continue;
        const key = `${item.name}|${item.variant}`;
        const row = map.get(key) ?? {
          name: item.name,
          variant: item.variant,
          qty: 0,
          tables: new Set<string>(),
        };
        row.qty += item.qty;
        row.tables.add(ticket.tableLabel ?? "Parcel");
        map.set(key, row);
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets]);

  const stockGroups = useMemo(() => {
    const map = new Map<string, StockVariantDto[]>();
    for (const variant of stock) {
      const list = map.get(variant.itemName) ?? [];
      list.push(variant);
      map.set(variant.itemName, list);
    }
    return [...map.entries()];
  }, [stock]);

  if (unauthorized) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-5">
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <h1 className="text-xl font-semibold">Chef sign in</h1>
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

  return (
    <main className="min-h-screen px-3 py-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kitchen</h1>
          <p className="text-xs text-slate-400">
            {snapshot?.me.name ?? "Chef"} · {tickets.filter((ticket) => ticket.status !== "CANCELLED").length} open
            tickets · {dishes.reduce((sum, dish) => sum + dish.qty, 0)} items
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge status={stream} />
          <button
            type="button"
            className={byDish ? BTN_PRIMARY : BTN}
            onClick={() => setByDish((value) => !value)}
          >
            By dish
          </button>
          <button
            type="button"
            className={showStock ? BTN_PRIMARY : BTN}
            onClick={() => {
              setShowStock((value) => !value);
              if (!showStock) void loadStock();
            }}
          >
            Stock
          </button>
          <button type="button" className={BTN} onClick={() => void signOut()}>
            Out
          </button>
        </div>
      </header>

      <div className="mt-3">
        <ShiftBar
          unlocked={shift.unlocked}
          screenAwake={shift.screenAwake}
          onStart={() => void shift.start()}
        />
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {showStock ? (
        <section className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Out of stock
          </h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stockGroups.map(([itemName, variants]) => (
              <div key={itemName} className="rounded-lg border border-slate-800 p-2">
                <p className="text-sm font-medium">{itemName}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {variants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void act(`stock-${variant.id}`, async () => {
                          await postJson(`/api/menu-variants/${variant.id}/availability`, {
                            available: !variant.available,
                          });
                          await loadStock();
                        })
                      }
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        variant.available
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-red-500/20 text-red-300 line-through"
                      }`}
                    >
                      {variant.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {cancelled.length > 0 ? (
        <section className="mt-3 animate-pulse rounded-xl border-2 border-red-500 bg-red-500/10 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-red-300">
            Cancelled
          </h2>
          <div className="mt-1 space-y-1 text-sm text-red-200">
            {cancelled.map((ticket) => (
              <p key={ticket.id}>
                KOT {ticket.kotNumber} · {ticket.tableLabel ?? "Parcel"} ·{" "}
                {ticket.items
                  .filter((item) => item.cancelled)
                  .map((item) => `${item.name} (${item.variant})`)
                  .join(", ")}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {byDish ? (
        <section className="mt-3 space-y-2">
          {dishes.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
              No open dishes.
            </p>
          ) : (
            dishes.map((dish) => (
              <div
                key={`${dish.name}-${dish.variant}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
              >
                <div>
                  <p className="text-lg font-semibold">
                    {dish.name} <span className="text-slate-400">({dish.variant})</span>
                  </p>
                  <p className="text-xs text-slate-400">{[...dish.tables].join(", ")}</p>
                </div>
                <p className="text-2xl font-semibold text-emerald-300">×{dish.qty}</p>
              </div>
            ))
          )}
        </section>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {columns.map((column) => (
            <section key={column.key} className="space-y-2">
              <h2 className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400">
                {column.title}
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px]">
                  {column.items.length}
                </span>
              </h2>
              {column.items.length === 0 ? (
                <p className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-4 text-sm text-slate-500">
                  No tickets yet
                </p>
              ) : (
                column.items.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    serverNowMs={serverNowMs}
                    amber={snapshot?.settings.TICKET_AMBER_S ?? 600}
                    red={snapshot?.settings.TICKET_RED_S ?? 1200}
                    busy={busy}
                    onStart={() =>
                      act(`start-${ticket.id}`, () => postJson(`/api/orders/${ticket.id}/start`))
                    }
                    onReady={() =>
                      act(`ready-${ticket.id}`, () => postJson(`/api/orders/${ticket.id}/ready`))
                    }
                  />
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function TicketCard({
  ticket,
  serverNowMs,
  amber,
  red,
  busy,
  onStart,
  onReady,
}: {
  ticket: KitchenTicketDto;
  serverNowMs: number;
  amber: number;
  red: number;
  busy: string | null;
  onStart: () => void;
  onReady: () => void;
}) {
  const age = Math.max(0, Math.round((serverNowMs - new Date(ticket.placedAt).getTime()) / 1000));
  const ageClass = age >= red ? "text-red-300" : age >= amber ? "text-amber-300" : "text-slate-400";

  return (
    <article
      className={`rounded-xl border p-3 ${
        ticket.status === "READY"
          ? "border-violet-500/50 bg-violet-500/10"
          : ticket.status === "PREPARING"
            ? "border-sky-500/40 bg-sky-500/5"
            : "border-slate-700 bg-slate-900/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold leading-none">KOT {ticket.kotNumber}</p>
          <p className="mt-1 text-xs text-slate-400">
            {ticket.tableLabel ?? "Parcel"} · {ticket.zoneName ?? "—"}
            <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
              {ticket.isAc ? "AC" : "Non-AC"}
            </span>
          </p>
        </div>
        <span className={`font-mono text-xs ${ageClass}`}>{elapsedLabel(ticket.placedAt, serverNowMs)}</span>
      </div>

      <ul className="mt-2 space-y-1 text-sm">
        {ticket.items.map((item) => (
          <li key={item.id} className={item.cancelled ? "text-red-300 line-through" : "text-slate-200"}>
            <span className="font-semibold">{item.qty}×</span> {item.name}{" "}
            <span className="text-slate-400">({item.variant})</span>
            {item.note ? <span className="ml-1 text-amber-300">· {item.note}</span> : null}
            {item.cancelled && item.cancelReason ? (
              <span className="ml-1 text-[11px] text-red-300">({item.cancelReason})</span>
            ) : null}
          </li>
        ))}
      </ul>

      {ticket.note ? (
        <p className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-200">{ticket.note}</p>
      ) : null}

      {ticket.status !== "READY" ? (
        <div className="mt-2 flex gap-2">
          {ticket.status === "PLACED" ? (
            <button type="button" className={BTN} disabled={busy !== null} onClick={onStart}>
              Start
            </button>
          ) : null}
          <button type="button" className={`${BTN_PRIMARY} flex-1`} disabled={busy !== null} onClick={onReady}>
            Ready
          </button>
        </div>
      ) : (
        <p className="mt-2 rounded bg-violet-500/15 px-2 py-1 text-center text-xs font-medium text-violet-200">
          Waiting for pickup
        </p>
      )}
    </article>
  );
}
