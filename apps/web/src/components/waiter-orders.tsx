"use client";

import { HttpError, errorMessage, isRetryable, postJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import {
  failedCount,
  moveToFailed,
  readFailed,
  readPending,
  removeFailed,
  removePending,
  reopenFailed as reopenFailedOrder,
  retryFailed as retryFailedOrder,
  type FailedOrder,
  type PendingOrder,
} from "@/lib/offline-orders";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

type WaiterOrdersValue = {
  pending: PendingOrder[];
  failed: FailedOrder[];
  needsSignIn: boolean;
  flush: () => Promise<void>;
  retryFailed: (clientKey: string) => Promise<void>;
  discardFailed: (clientKey: string) => void;
  reopenFailed: (order: FailedOrder) => void;
};

const WaiterOrdersContext = createContext<WaiterOrdersValue | null>(null);

export function useWaiterOrders(): WaiterOrdersValue {
  const value = useContext(WaiterOrdersContext);
  if (!value) throw new Error("useWaiterOrders must be used inside WaiterOrdersProvider");
  return value;
}

export function WaiterOrdersProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { refresh } = useSnapshotLive();
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [failed, setFailed] = useState<FailedOrder[]>([]);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const flushing = useRef(false);

  const sync = useCallback(() => {
    setPending(readPending());
    setFailed(readFailed());
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const order of readPending()) {
        try {
          const result = await postJson<{ duplicate?: boolean }>("/api/orders", {
            tableId: order.tableId,
            sessionId: order.sessionId,
            clientKey: order.clientKey,
            note: order.note,
            items: order.items,
          });
          void result;
          removePending(order.clientKey);
          setNeedsSignIn(false);
        } catch (caught) {
          if (caught instanceof HttpError && caught.status === 401) {
            setNeedsSignIn(true);
            continue;
          }
          if (!isRetryable(caught)) {
            moveToFailed(order, errorMessage(caught));
          }
        }
      }
    } finally {
      flushing.current = false;
      sync();
      await refresh();
    }
  }, [refresh, sync]);

  useEffect(() => {
    sync();
    window.addEventListener("dinesense:pending", sync);
    const onOnline = () => {
      if (readPending().length > 0) void flush();
    };
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => {
      if (readPending().length > 0 && navigator.onLine) void flush();
    }, 5000);
    if (readPending().length > 0) void flush();
    return () => {
      window.removeEventListener("dinesense:pending", sync);
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [flush, sync]);

  const retryFailed = useCallback(
    async (clientKey: string) => {
      try {
        retryFailedOrder(clientKey);
        sync();
        await flush();
      } catch (caught) {
        toast.error(errorMessage(caught));
      }
    },
    [flush, sync],
  );

  const discardFailed = useCallback(
    (clientKey: string) => {
      if (!window.confirm("Discard this failed order? This cannot be undone.")) return;
      try {
        removeFailed(clientKey);
        sync();
      } catch (caught) {
        toast.error(errorMessage(caught));
      }
    },
    [sync],
  );

  const reopenFailed = useCallback(
    (order: FailedOrder) => {
      try {
        reopenFailedOrder(order.clientKey);
        sync();
        const query = order.tableId
          ? `?tableId=${encodeURIComponent(order.tableId)}`
          : order.sessionId
            ? `?sessionId=${encodeURIComponent(order.sessionId)}`
            : "";
        router.push(`/waiter/order${query}`);
      } catch (caught) {
        toast.error(errorMessage(caught));
      }
    },
    [router, sync],
  );

  const value = useMemo(
    () => ({ pending, failed, needsSignIn, flush, retryFailed, discardFailed, reopenFailed }),
    [pending, failed, needsSignIn, flush, retryFailed, discardFailed, reopenFailed],
  );

  return (
    <WaiterOrdersContext.Provider value={value}>
      {children}
      <WaiterOrderStatus />
    </WaiterOrdersContext.Provider>
  );
}

function WaiterOrderStatus() {
  const { pending, failed, needsSignIn, flush, retryFailed, discardFailed, reopenFailed } = useWaiterOrders();
  const [showFailed, setShowFailed] = useState(true);
  const pendingLabel = `${pending.length} ${pending.length === 1 ? "order" : "orders"} queued`;

  return (
    <div className="fixed inset-x-0 top-0 z-40 space-y-1.5 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      {needsSignIn ? (
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-coral/40 bg-coral px-4 py-2.5 text-sm font-medium text-white">
          <span>Sign in again to send queued orders.</span>
          <Link href="/login" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-coral">
            Sign in
          </Link>
        </div>
      ) : null}
      {pending.length > 0 ? (
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/[0.12] px-4 py-2.5 text-sm text-accent">
          <span>{pendingLabel} — will send when the server is back</span>
          <button
            type="button"
            onClick={() => void flush()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/40 px-3 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry now
          </button>
        </div>
      ) : null}
      {failed.length > 0 ? (
        <div className="mx-auto max-w-3xl rounded-xl border border-coral/40 bg-coral/[0.1] px-4 py-2.5 text-sm text-coral">
          <button
            type="button"
            onClick={() => setShowFailed((value) => !value)}
            className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Failed orders ({failed.length})
            </span>
            <span>{showFailed ? "Hide" : "Review"}</span>
          </button>
          {showFailed ? (
            <ul className="mt-2 space-y-2 border-t border-coral/30 pt-2">
              {failed.map((order) => (
                <li key={order.clientKey} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <strong>{order.label}</strong> · {order.items.map((item) => `${item.qty}× variant ${item.variantId}`).join(", ")}
                    <span className="mt-0.5 block text-coral/80">{order.reason}</span>
                  </span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => void retryFailed(order.clientKey)}
                      className="min-h-11 rounded-lg border border-coral/40 px-2.5"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => reopenFailed(order)}
                      className="min-h-11 rounded-lg border border-coral/40 px-2.5"
                    >
                      Reopen
                    </button>
                    <button
                      type="button"
                      onClick={() => discardFailed(order.clientKey)}
                      className="min-h-11 rounded-lg border border-coral/40 px-2.5"
                    >
                      Discard
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
