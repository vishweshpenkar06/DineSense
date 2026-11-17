"use client";

import type { MenuCategoryDto, MenuItemDto, MenuVariantDto, OrderContextResponse } from "@dinesense/core";
import { BrandMark } from "@/components/brand";
import { ConnectionBadge } from "@/components/connection-badge";
import { errorMessage, getJson, isRetryable, postJson } from "@/lib/client";
import { enqueuePending } from "@/lib/offline-orders";
import type { StreamStatus } from "@/lib/live";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingBag,
  X,
} from "lucide-react";
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
      group("Veg soups", items.filter((item) => item.isVeg)),
      group("Non-veg soups", items.filter((item) => !item.isVeg)),
    ].filter((entry) => entry.items.length > 0);
  }
  if (category.name === "Chinese") {
    return [
      group("Chinese veg", items.filter((item) => item.isVeg)),
      group("Chinese non-veg", items.filter((item) => !item.isVeg)),
    ].filter((entry) => entry.items.length > 0);
  }
  if (/fried rice/i.test(category.name)) {
    const friedRice = items.filter((item) => /fried rice/i.test(item.name));
    const noodles = items.filter((item) => !/fried rice/i.test(item.name));
    return [
      group("Veg fried rice", friedRice.filter((item) => item.isVeg)),
      group("Non-veg fried rice", friedRice.filter((item) => !item.isVeg)),
      group("Veg noodles", noodles.filter((item) => item.isVeg)),
      group("Non-veg noodles", noodles.filter((item) => !item.isVeg)),
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

function VegMark({ isVeg }: { isVeg: boolean }) {
  return (
    <span
      aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
      className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
        isVeg ? "border-jade" : "border-coral"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isVeg ? "bg-jade" : "bg-coral"}`} />
    </span>
  );
}

export default function OrderPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center text-sm text-muted">
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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderNote, setOrderNote] = useState("");
  const [lastLineKey, setLastLineKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState<StreamStatus>("connecting");
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const queryString = tableId ? `tableId=${tableId}` : `sessionId=${sessionId}`;
      const data = await getJson<OrderContextResponse>(`/api/order-context?${queryString}`);
      setContext(data);
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

  const search = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!context || !search) return [];
    return context.menu.categories.flatMap((entry) =>
      entry.items
        .filter(
          (item) =>
            item.name.toLowerCase().includes(search) ||
            (item.nameLocal ?? "").toLowerCase().includes(search),
        )
        .map((item) => ({ item, category: entry.name })),
    );
  }, [context, search]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.pricePaise * line.qty, 0),
    [cart],
  );
  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);

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
    <main className="mx-auto min-h-[100dvh] max-w-3xl px-4 pb-36 pt-4 sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/waiter"
            aria-label="Back to floor"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[1.75rem] font-medium leading-none tracking-[-0.02em]">
              {context?.table ? `Table ${context.table.label}` : "New parcel"}
            </h1>
            <p className="mt-1.5 truncate text-xs text-muted">
              {context?.zone.name} · {context?.zone.isAc ? "AC" : "Non-AC"} prices
              {context?.table ? ` · ${context.table.seats} seats` : " · takeaway"}
            </p>
          </div>
        </div>
        <ConnectionBadge status={stream} />
      </header>

      {error ? (
        <div className="mt-3 flex flex-wrap items-start gap-2 rounded-2xl border border-coral/30 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          {error.includes("different staff role") ? (
            <button
              type="button"
              onClick={() => {
                void fetch("/api/auth/logout", { method: "POST" }).then(() => router.replace("/login"));
              }}
              className="rounded-lg border border-coral/40 px-2.5 py-1 text-xs font-medium"
            >
              Switch account
            </button>
          ) : null}
        </div>
      ) : null}

      {context && !context.session ? (
        <section className="mt-4 rounded-2xl border border-accent/30 bg-accent/[0.06] p-4">
          <p className="text-sm text-accent">No open visit for this table.</p>
          <button
            type="button"
            onClick={() => void seatTable()}
            className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas"
          >
            Seat table
          </button>
        </section>
      ) : null}

      {context?.session ? (
        <>
          <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-line bg-canvas/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${context.menu.categories.reduce((sum, entry) => sum + entry.items.length, 0)} dishes`}
                className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-10 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent/50"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-raised text-muted hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </label>
          </div>

          {search ? (
            <section className="mt-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-medium">
                  {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
                </h2>
                <button type="button" onClick={() => setQuery("")} className="text-xs font-medium text-accent">
                  Clear
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {searchResults.map(({ item, category: categoryName }) => (
                  <ItemRow key={item.id} item={item} categoryName={categoryName} onAdd={addVariant} />
                ))}
              </div>
              {searchResults.length === 0 ? (
                <div className="mt-8 flex flex-col items-center gap-2 text-center">
                  <Search className="h-6 w-6 text-faint" />
                  <p className="text-sm text-muted">No dish matches “{query}”.</p>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="mt-4 space-y-8">
              {context.menu.categories.map((entry) => (
                <div key={entry.id}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-ink">{entry.name}</h2>
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-xs text-faint">{entry.items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {menuGroups(entry).map((group) => (
                      <div key={group.title ?? "all"}>
                        {group.title ? (
                          <div className="mb-1.5 flex items-center gap-2 pt-1">
                            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">
                              {group.title}
                            </h3>
                            <span className="h-px flex-1 bg-line" />
                            <span className="text-xs text-faint">{group.items.length}</span>
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          {group.items.map((item) => (
                            <ItemRow key={item.id} item={item} onAdd={addVariant} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {cartOpen ? (
            <CartSheet
              cart={cart}
              total={total}
              itemCount={itemCount}
              orderNote={orderNote}
              sending={sending}
              onClose={() => setCartOpen(false)}
              onChangeQty={changeQty}
              onSetNote={setNote}
              onFocusLine={setLastLineKey}
              onQuickNote={appendQuickNote}
              onOrderNote={setOrderNote}
              onSend={() => void send()}
            />
          ) : null}

          {cart.length > 0 ? (
          <div
            aria-hidden={cartOpen}
            className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur ${
              cartOpen ? "hidden" : ""
            }`}
          >
            <div className="mx-auto flex max-w-3xl items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                disabled={cart.length === 0}
                className="min-w-0 flex-1 rounded-xl px-1 py-0.5 text-left disabled:opacity-50"
              >
                <p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-faint">
                  Cart · {itemCount} {itemCount === 1 ? "item" : "items"}
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">{money(total)}</p>
              </button>
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                disabled={cart.length === 0}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-sm font-medium text-ink transition hover:bg-raised disabled:opacity-40"
              >
                <ShoppingBag className="h-4 w-4" /> Review
              </button>
              <button
                type="button"
                disabled={sending || cart.length === 0}
                onClick={() => void send()}
                className="flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-canvas transition hover:bg-[#efc05e] disabled:bg-raised disabled:text-faint disabled:hover:bg-raised"
              >
                <Send className="h-4 w-4" />
                {sending ? "Sending…" : "Send to kitchen"}
              </button>
            </div>
          </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function ItemRow({
  item,
  categoryName,
  onAdd,
}: {
  item: MenuItemDto;
  categoryName?: string;
  onAdd: (item: MenuItemDto, variant: MenuVariantDto) => void;
}) {
  const single = item.variants.length === 1 ? item.variants[0] : null;
  return (
    <article
      className={`rounded-2xl border border-line bg-surface px-3.5 py-3 transition ${
        item.available ? "hover:border-slate-600" : "opacity-45"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <VegMark isVeg={item.isVeg} />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug text-ink">{item.name}</p>
          {item.nameLocal ? <p className="mt-0.5 text-[11px] text-faint">{item.nameLocal}</p> : null}
          {categoryName ? <p className="mt-0.5 text-[10px] uppercase tracking-wider text-faint">{categoryName}</p> : null}
        </div>

        {!item.available ? (
          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-faint">
            Sold out
          </span>
        ) : single ? (
          <button
            type="button"
            data-testid="add-item"
            disabled={!single.available || single.pricePaise === null}
            onClick={() => onAdd(item, single)}
            aria-label={`Add ${item.name} for ${single.pricePaise === null ? "—" : money(single.pricePaise)}`}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/25 bg-accent/[0.07] px-3 py-2 text-sm font-semibold tabular-nums text-accent transition hover:bg-accent/[0.14] disabled:opacity-40"
          >
            {single.pricePaise === null ? "—" : money(single.pricePaise)}
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {item.available && !single && item.variants.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
          {item.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              data-testid="add-item"
              disabled={!variant.available || variant.pricePaise === null}
              onClick={() => onAdd(item, variant)}
              className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.07] px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/[0.14] disabled:opacity-40"
            >
              {variant.label}
              <span className="tabular-nums">{variant.pricePaise === null ? "—" : money(variant.pricePaise)}</span>
              <Plus className="h-3 w-3" />
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CartSheet({
  cart,
  total,
  itemCount,
  orderNote,
  sending,
  onClose,
  onChangeQty,
  onSetNote,
  onFocusLine,
  onQuickNote,
  onOrderNote,
  onSend,
}: {
  cart: CartLine[];
  total: number;
  itemCount: number;
  orderNote: string;
  sending: boolean;
  onClose: () => void;
  onChangeQty: (key: string, delta: number) => void;
  onSetNote: (key: string, note: string) => void;
  onFocusLine: (key: string) => void;
  onQuickNote: (note: string) => void;
  onOrderNote: (note: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close cart" onClick={onClose} className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review order"
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-3xl overflow-y-auto rounded-t-3xl border border-line bg-canvas p-5 shadow-sheet"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-medium">Your order</h2>
            <p className="mt-1 text-xs text-muted">{itemCount} {itemCount === 1 ? "item" : "items"} · review before sending</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-5 divide-y divide-line">
          {cart.map((line) => (
            <li key={line.key} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{line.name}</p>
                  <p className="mt-0.5 text-[11px] text-faint">{line.variant}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{money(line.pricePaise * line.qty)}</p>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChangeQty(line.key, -1)}
                  aria-label={`Remove one ${line.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-5 text-center text-sm font-semibold">{line.qty}</span>
                <button
                  type="button"
                  onClick={() => onChangeQty(line.key, 1)}
                  aria-label={`Add one ${line.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <input
                  value={line.note}
                  onChange={(event) => onSetNote(line.key, event.target.value)}
                  onFocus={() => onFocusLine(line.key)}
                  placeholder="Note (less spicy, no onion…)"
                  className="ml-1 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-2 text-xs text-ink outline-none placeholder:text-faint focus:border-accent/50"
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-1 flex flex-wrap gap-1.5">
          {QUICK_NOTES.map((note) => (
            <button
              key={note}
              type="button"
              onClick={() => onQuickNote(note)}
              className="rounded-full border border-line px-3 py-1.5 text-[11px] text-muted transition hover:border-accent/40 hover:text-ink"
            >
              + {note}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-[11px] font-medium uppercase tracking-wider text-faint">
          Order note
          <input
            value={orderNote}
            onChange={(event) => onOrderNote(event.target.value)}
            placeholder="Anything for the kitchen?"
            className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none placeholder:text-faint focus:border-accent/50"
          />
        </label>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-faint">Total</p>
            <p className="text-xl font-semibold tabular-nums">{money(total)}</p>
          </div>
          <button
            type="button"
            disabled={sending || cart.length === 0}
            onClick={onSend}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-canvas transition hover:bg-[#efc05e] disabled:bg-raised disabled:text-faint disabled:hover:bg-raised"
          >
            {sending ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send to kitchen"}
          </button>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-faint">
          <BrandMark className="h-3 w-3" /> Works offline — queued and sent automatically.
        </p>
      </div>
    </div>
  );
}
