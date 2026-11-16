"use client";

import { Brand, BrandMark } from "@/components/brand";
import { ConnectionBadge } from "@/components/connection-badge";
import { ShiftBar } from "@/components/shift-bar";
import type { KitchenTicketDto, StockVariantDto } from "@dinesense/core";
import { errorMessage, getJson, postJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import { useShift } from "@/lib/shift";
import { elapsedLabel } from "@/lib/ui";
import {
  CheckCircle2,
  ChefHat,
  Flame,
  Layers,
  LogOut,
  Package,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-slate-600 hover:bg-raised disabled:opacity-40";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-canvas transition hover:bg-[#efc05e] disabled:bg-raised disabled:text-faint disabled:hover:bg-raised";

const COLUMN_META = {
  PLACED: { dot: "bg-accent", empty: "No new tickets" },
  PREPARING: { dot: "bg-sky-400", empty: "Nothing cooking" },
  READY: { dot: "bg-iris", empty: "Nothing waiting" },
} as const;

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
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [stock]);

  if (unauthorized) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center px-5">
        <div className="w-full rounded-3xl border border-line bg-surface p-8 text-center">
          <BrandMark className="mx-auto h-10 w-10 text-accent" />
          <h1 className="mt-5 font-display text-2xl">Chef sign in</h1>
          <Link href="/login" className={`${BTN_PRIMARY} mt-5 w-full py-3`}>
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  const openTickets = tickets.filter((ticket) => ticket.status !== "CANCELLED").length;
  const openItems = dishes.reduce((sum, dish) => sum + dish.qty, 0);
  const boardEmpty = openTickets === 0;

  return (
    <main className="mx-auto min-h-[100dvh] max-w-7xl px-4 pb-10 pt-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 w-8 shrink-0 text-accent sm:hidden" />
          <Brand compact className="hidden sm:inline-flex" />
          <span className="hidden h-7 w-px bg-line sm:block" />
          <div className="min-w-0">
            <h1 className="font-display text-[1.7rem] font-medium leading-none tracking-[-0.02em] sm:text-3xl">
              Kitchen
            </h1>
            <p className="mt-1 truncate text-xs text-muted">
              {snapshot?.me.name ?? "Chef"} · {openTickets} open {openTickets === 1 ? "ticket" : "tickets"} · {openItems} {openItems === 1 ? "item" : "items"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ConnectionBadge status={stream} />
          <button
            type="button"
            className={byDish ? `${BTN_PRIMARY} px-3` : `${BTN} px-3`}
            aria-pressed={byDish}
            onClick={() => setByDish((value) => !value)}
          >
            <Layers className="h-4 w-4" /> <span className="hidden sm:inline">By dish</span>
          </button>
          <button
            type="button"
            className={showStock ? `${BTN_PRIMARY} px-3` : `${BTN} px-3`}
            aria-pressed={showStock}
            onClick={() => {
              setShowStock((value) => !value);
              if (!showStock) void loadStock();
            }}
          >
            <Package className="h-4 w-4" /> <span className="hidden sm:inline">Stock</span>
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:text-ink"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ShiftBar unlocked={shift.unlocked} screenAwake={shift.screenAwake} onStart={() => void shift.start()} />
        {snapshot?.settings.SHADOW_MODE ? (
          <span className="rounded-full border border-accent/25 bg-accent/[0.06] px-2.5 py-1 text-[11px] text-accent">
            Shadow mode · paper chits are the backup
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 rounded-2xl border border-coral/30 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
          {error}
        </div>
      ) : null}

      {showStock ? (
        <section className="mt-4 rounded-2xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Stock</h2>
              <p className="text-[11px] text-muted">Tap a variant to mark it sold out or available.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowStock(false)}
              aria-label="Close stock"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {stockGroups.map(([itemName, variants]) => (
              <div key={itemName} className="rounded-xl border border-line bg-canvas/40 p-3">
                <p className="text-sm font-medium">{itemName}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
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
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        variant.available
                          ? "border-jade/25 bg-jade/[0.08] text-jade"
                          : "border-coral/30 bg-coral/[0.08] text-coral line-through"
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
        <section className="mt-4 rounded-2xl border border-coral/40 bg-coral/[0.07] px-4 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-coral">Cancelled</h2>
          <div className="mt-1.5 space-y-1 text-sm text-coral/90">
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
        <section className="mt-4 space-y-2">
          {dishes.length === 0 ? (
            <p className="rounded-2xl border border-line bg-surface p-5 text-sm text-muted">No open dishes.</p>
          ) : (
            dishes.map((dish) => (
              <div
                key={`${dish.name}-${dish.variant}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    {dish.name} <span className="font-normal text-muted">({dish.variant})</span>
                  </p>
                  <p className="mt-0.5 text-xs text-faint">{[...dish.tables].join(", ")}</p>
                </div>
                <p className="shrink-0 font-display text-2xl font-medium text-accent">×{dish.qty}</p>
              </div>
            ))
          )}
        </section>
      ) : boardEmpty ? (
        <div className="mt-20 flex flex-col items-center px-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-jade/20 bg-jade/[0.06] text-jade">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <h2 className="mt-4 font-display text-2xl font-medium">Kitchen is clear</h2>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">
            New tickets land here automatically. Keep this screen open during service.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {columns.map((column) => {
            const meta = COLUMN_META[column.key as keyof typeof COLUMN_META];
            return (
              <section key={column.key} className="min-w-0">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {column.title}
                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted">
                    {column.items.length}
                  </span>
                </h2>
                <div className="space-y-2">
                  {column.items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-xs text-faint">
                      {meta.empty}
                    </div>
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
                </div>
              </section>
            );
          })}
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
  const late = age >= red;
  const warning = !late && age >= amber;

  return (
    <article
      className={`rounded-2xl border p-4 ${
        ticket.status === "READY"
          ? "border-iris/35 bg-iris/[0.05]"
          : ticket.status === "PREPARING"
            ? "border-sky-400/25 bg-sky-400/[0.03]"
            : "border-line bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <ChefHat className="h-3.5 w-3.5" /> KOT {ticket.kotNumber}
          </p>
          <p className="mt-1 truncate text-base font-semibold leading-none">
            {ticket.tableLabel ?? "Parcel"}
            <span className="ml-1.5 text-xs font-normal text-muted">
              {ticket.zoneName ?? "—"} · {ticket.isAc ? "AC" : "Non-AC"}
            </span>
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums ${
            late
              ? "border-coral/35 bg-coral/[0.08] text-coral"
              : warning
                ? "border-accent/30 bg-accent/[0.07] text-accent"
                : "border-line text-muted"
          }`}
        >
          {late ? <Flame className="mr-0.5 inline h-2.5 w-2.5" /> : null}
          {elapsedLabel(ticket.placedAt, serverNowMs)}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {ticket.items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-2 text-sm leading-snug ${
              item.cancelled ? "text-coral line-through" : "text-ink"
            }`}
          >
            <span className="w-5 shrink-0 text-right font-semibold text-accent">{item.qty}×</span>
            <span className="min-w-0">
              {item.name} <span className="text-muted">({item.variant})</span>
              {item.note ? <span className="mt-0.5 block text-[11px] text-accent">{item.note}</span> : null}
              {item.cancelled && item.cancelReason ? (
                <span className="block text-[11px] text-coral">({item.cancelReason})</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {ticket.note ? (
        <p className="mt-2.5 rounded-lg border border-accent/20 bg-accent/[0.06] px-2.5 py-1.5 text-xs text-accent">
          {ticket.note}
        </p>
      ) : null}

      {ticket.status === "PLACED" ? (
        <button type="button" className={`${BTN_PRIMARY} mt-3 w-full`} disabled={busy !== null} onClick={onStart}>
          Start
        </button>
      ) : ticket.status === "PREPARING" ? (
        <button type="button" className={`${BTN_PRIMARY} mt-3 w-full`} disabled={busy !== null} onClick={onReady}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Ready
        </button>
      ) : (
        <p className="mt-3 rounded-lg border border-iris/20 bg-iris/[0.07] px-2 py-1.5 text-center text-[11px] font-medium text-iris">
          Waiting for pickup
        </p>
      )}
    </article>
  );
}
