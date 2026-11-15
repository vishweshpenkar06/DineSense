"use client";

import type { MenuCategoryDto, MenuItemDto, MenuVariantDto, OrderContextResponse } from "@dinesense/core";
import { ConnectionBadge } from "@/components/connection-badge";
import { errorMessage, getJson, isRetryable, postJson } from "@/lib/client";
import { enqueuePending } from "@/lib/offline-orders";
import type { StreamStatus } from "@/lib/live";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CartLine = {
  key: string;
  variantId: string;
  name: string;
  variant: string;
  pricePaise: number;
  qty: number;
  note: string;
};

const QUICK_NOTES = ["Less spicy", "No onion-garlic", "Extra spicy", "Jain"];

function menuGroups(category: MenuCategoryDto): Array<{ title: string | null; items: MenuItemDto[] }> {
  const items = category.items;
  const group = (title: string, groupItems: MenuItemDto[]) => ({ title, items: groupItems });
  if (category.name === "Soups") {
    return [
      group("Veg Soups", items.filter((item) => item.isVeg)),
      group("Non Veg Soups", items.filter((item) => !item.isVeg)),
    ].filter((entry) => entry.items.length > 0);
  }
  if (category.name === "Chinese") {
    return [
      group("Chinese Veg", items.filter((item) => item.isVeg)),
      group("Chinese Non Veg", items.filter((item) => !item.isVeg)),
    ].filter((entry) => entry.items.length > 0);
  }
  if (/fried rice/i.test(category.name)) {
    const friedRice = items.filter((item) => /fried rice/i.test(item.name));
    const noodles = items.filter((item) => !/fried rice/i.test(item.name));
    return [
      group("Veg Fried Rice", friedRice.filter((item) => item.isVeg)),
      group("Non Veg Fried Rice", friedRice.filter((item) => !item.isVeg)),
      group("Veg Noodles", noodles.filter((item) => item.isVeg)),
      group("Non Veg Noodles", noodles.filter((item) => !item.isVeg)),
    ].filter((entry) => entry.items.length > 0);
  }
  return [{ title: null, items }];
}

function newClientKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(paise: number): string {
  return `₹${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`;
}

export default function OrderPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm text-slate-400">
          Loading menu…
        </main>
      }
    >
      <OrderScreen />
    </Suspense>
  );
}

function OrderScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const tableId = params.get("tableId");
  const sessionId = params.get("sessionId");

  const [context, setContext] = useState<OrderContextResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderNote, setOrderNote] = useState("");
  const [lastLineKey, setLastLineKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState<StreamStatus>("connecting");

  const load = useCallback(async () => {
    try {
      const query = tableId ? `tableId=${tableId}` : `sessionId=${sessionId}`;
      const data = await getJson<OrderContextResponse>(`/api/order-context?${query}`);
      setContext(data);
      setCategoryId((current) => current ?? data.menu.categories[0]?.id ?? null);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [tableId, sessionId]);

  useEffect(() => {
    if (!tableId && !sessionId) {
      setError("No table or parcel selected");
      return;
    }
    void load();
  }, [tableId, sessionId, load]);

  useEffect(() => {
    const source = new EventSource("/api/stream");
    const reload = () => void load();
    source.addEventListener("open", () => setStream("live"));
    source.addEventListener("menu.availability", reload);
    source.addEventListener("table.updated", reload);
    source.onerror = () => setStream("reconnecting");
    return () => source.close();
  }, [load]);

  const category = context?.menu.categories.find((entry) => entry.id === categoryId) ?? null;

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.pricePaise * line.qty, 0),
    [cart],
  );

  function addVariant(item: MenuItemDto, variant: MenuVariantDto) {
    if (!variant.available || variant.pricePaise === null) return;
    setCart((current) => {
      const existing = current.find((line) => line.key === variant.id);
      if (existing) {
        return current.map((line) =>
          line.key === variant.id ? { ...line, qty: line.qty + 1 } : line,
        );
      }
      return [
        ...current,
        {
          key: variant.id,
          variantId: variant.id,
          name: item.name,
          variant: variant.label,
          pricePaise: variant.pricePaise as number,
          qty: 1,
          note: "",
        },
      ];
    });
    setLastLineKey(variant.id);
  }

  function changeQty(key: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.key === key ? { ...line, qty: Math.max(0, line.qty + delta) } : line))
        .filter((line) => line.qty > 0),
    );
  }

  function setNote(key: string, note: string) {
    setCart((current) => current.map((line) => (line.key === key ? { ...line, note } : line)));
  }

  function appendQuickNote(note: string) {
    const key = lastLineKey ?? cart[cart.length - 1]?.key;
    if (!key) return;
    setCart((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        if (line.note.includes(note)) return line;
        return { ...line, note: line.note ? `${line.note}, ${note}` : note };
      }),
    );
  }

  async function seatTable() {
    if (!tableId) return;
    try {
      await postJson(`/api/tables/${tableId}/state`, { state: "occupied" });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function send() {
    if (!context?.session || cart.length === 0) return;
    setSending(true);
    setError(null);
    const payload = {
      sessionId: context.session.id,
      tableId: context.table?.id,
      clientKey: newClientKey(),
      note: orderNote.trim() || undefined,
      items: cart.map((line) => ({
        variantId: line.variantId,
        qty: line.qty,
        note: line.note.trim() || undefined,
      })),
    };
    const label = context.table ? `Table ${context.table.label}` : "Parcel";
    try {
      await postJson("/api/orders", payload);
      router.push("/waiter");
    } catch (caught) {
      if (isRetryable(caught)) {
        enqueuePending({ ...payload, label, createdAt: new Date().toISOString() });
        router.push("/waiter");
        return;
      }
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-4 pb-32">
      <header className="flex items-center justify-between gap-2">
        <div>
          <Link href="/waiter" className="text-xs text-slate-400">
            ← Floor
          </Link>
          <h1 className="text-2xl font-semibold">
            {context?.table ? `Table ${context.table.label}` : "New parcel"}
          </h1>
          <p className="text-xs text-slate-400">
            {context?.zone.name} · {context?.zone.isAc ? "AC" : "Non-AC"}
            {context?.table ? ` · ${context.table.seats} seats` : " · takeaway"}
          </p>
        </div>
        <ConnectionBadge status={stream} />
      </header>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {context && !context.session ? (
        <section className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-200">No open visit for this table.</p>
          <button
            type="button"
            onClick={() => void seatTable()}
            className="mt-3 rounded-lg bg-emerald-500 px-4 py-2.5 font-semibold text-slate-950"
          >
            Seat table
          </button>
        </section>
      ) : null}

      {context?.session ? (
        <>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {context.menu.categories.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setCategoryId(entry.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                  entry.id === categoryId
                    ? "bg-emerald-500 text-slate-950"
                    : "border border-slate-700 bg-slate-900 text-slate-300"
                }`}
              >
                {entry.name}
              </button>
            ))}
          </div>

          <section className="mt-3 space-y-2">
            {category
              ? menuGroups(category).map((group) => (
                  <div key={group.title ?? "all"} className="space-y-2">
                    {group.title ? (
                      <h3 className="pt-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        {group.title}
                      </h3>
                    ) : null}
                    {group.items.map((item) => (
                      <article
                        key={item.id}
                        className={`rounded-xl border border-slate-800 bg-slate-900/60 p-3 ${
                          item.available ? "" : "opacity-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">
                              <span
                                className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${
                                  item.isVeg ? "bg-emerald-400" : "bg-red-400"
                                }`}
                              />
                              {item.name}
                            </p>
                            {item.nameLocal ? (
                              <p className="text-xs text-slate-500">{item.nameLocal}</p>
                            ) : null}
                          </div>
                          {!item.available ? (
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">
                              Out
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.variants.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              disabled={!variant.available || variant.pricePaise === null}
                              onClick={() => addVariant(item, variant)}
                              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm disabled:opacity-40"
                            >
                              {variant.label}
                              <span className="ml-2 font-mono text-emerald-300">
                                {variant.pricePaise === null ? "—" : money(variant.pricePaise)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ))
              : null}
          </section>

          <section className="mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Cart · {cart.reduce((sum, line) => sum + line.qty, 0)} items
            </h2>
            {cart.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Tap a size to add an item.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {cart.map((line) => (
                  <li key={line.key} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {line.name} <span className="text-slate-400">({line.variant})</span>
                      </p>
                      <p className="font-mono text-sm">{money(line.pricePaise * line.qty)}</p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeQty(line.key, -1)}
                        className="h-9 w-9 rounded-lg bg-slate-800 text-lg"
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-semibold">{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => changeQty(line.key, 1)}
                        className="h-9 w-9 rounded-lg bg-slate-800 text-lg"
                      >
                        +
                      </button>
                      <input
                        value={line.note}
                        onChange={(event) => setNote(line.key, event.target.value)}
                        onFocus={() => setLastLineKey(line.key)}
                        placeholder="Note (less spicy, no onion…)"
                        className="ml-1 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {cart.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_NOTES.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => appendQuickNote(note)}
                    className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                  >
                    {note}
                  </button>
                ))}
              </div>
            ) : null}

            <input
              value={orderNote}
              onChange={(event) => setOrderNote(event.target.value)}
              placeholder="Order note (optional)"
              className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm"
            />
          </section>

          <div className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 p-3 backdrop-blur">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <div className="flex-1">
                <p className="text-xs text-slate-400">Total</p>
                <p className="text-xl font-semibold">{money(total)}</p>
              </div>
              <button
                type="button"
                disabled={sending || cart.length === 0}
                onClick={() => void send()}
                className="rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-slate-950 disabled:opacity-40"
              >
                {sending ? "Sending…" : "Send to kitchen"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
