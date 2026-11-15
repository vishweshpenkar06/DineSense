"use client";

import type { BillViewDto, OpenBillRowDto } from "@dinesense/core";
import { ConnectionBadge } from "@/components/connection-badge";
import { errorMessage, getJson, postJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const BTN =
  "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 disabled:opacity-40";
const BTN_PRIMARY =
  "rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40";

function money(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function rupeesToPaise(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function ist(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function ReceptionPage() {
  const router = useRouter();
  const { snapshot, stream, unauthorized } = useSnapshotLive();
  const [sessions, setSessions] = useState<OpenBillRowDto[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [bill, setBill] = useState<BillViewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [printFormat, setPrintFormat] = useState<"80mm" | "a4">("80mm");
  const [extraLabel, setExtraLabel] = useState("");
  const [extraRupees, setExtraRupees] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountRupees, setDiscountRupees] = useState("");
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [card, setCard] = useState("");
  const [voiding, setVoiding] = useState<{ itemId: string; name: string; reason: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const isAdmin = snapshot?.me.role === "ADMIN";

  const loadOpen = useCallback(async () => {
    try {
      const data = await getJson<{ sessions: OpenBillRowDto[] }>("/api/bills/open");
      setSessions(data.sessions);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const loadBill = useCallback(async (sessionId: string) => {
    try {
      setBill(await getJson<BillViewDto>(`/api/bills/${sessionId}`));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void loadOpen();
  }, [loadOpen]);

  useEffect(() => {
    if (snapshot) {
      void loadOpen();
      if (selected) void loadBill(selected);
    }
  }, [snapshot, selected, loadOpen, loadBill]);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadOpen();
      if (selected) void loadBill(selected);
    }, 5000);
    return () => clearInterval(timer);
  }, [selected, loadOpen, loadBill]);

  async function selectSession(sessionId: string) {
    setSelected(sessionId);
    setBill(null);
    setNotice(null);
    setCash("");
    setUpi("");
    setCard("");
    setVoiding(null);
    await loadBill(sessionId);
  }

  async function act(run: () => Promise<BillViewDto | void>) {
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      if (result) setBill(result);
      await loadOpen();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function reloadSelected() {
    if (selected) await loadBill(selected);
    await loadOpen();
  }

  const escalated = useMemo(
    () =>
      snapshot?.tasks.filter(
        (task) =>
          task.escalatedAt !== null && (task.status === "OPEN" || task.status === "ACK"),
      ) ?? [],
    [snapshot],
  );

  const totalPaise = bill?.bill?.status === "OPEN" ? bill.draft.totalPaise : bill?.draft.totalPaise ?? 0;
  const enteredPaise = rupeesToPaise(cash) + rupeesToPaise(upi) + rupeesToPaise(card);
  const changePaise = Math.max(0, enteredPaise - totalPaise);

  async function pay() {
    if (!selected || !bill) return;
    const payments = [
      { method: "CASH" as const, amountPaise: rupeesToPaise(cash) },
      { method: "UPI" as const, amountPaise: rupeesToPaise(upi) },
      { method: "CARD" as const, amountPaise: rupeesToPaise(card) },
    ].filter((payment) => payment.amountPaise > 0);

    if (totalPaise > 0 && payments.reduce((sum, payment) => sum + payment.amountPaise, 0) < totalPaise) {
      setError("Payments do not cover the bill total");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await postJson<{ bill: BillViewDto; changePaise: number }>(
        `/api/bills/${selected}/pay`,
        { payments },
      );
      setBill(result.bill);
      setCash("");
      setUpi("");
      setCard("");
      setNotice(
        result.changePaise > 0
          ? `Paid. Return change ${money(result.changePaise)}.`
          : "Paid. Table is now waiting to be cleaned.",
      );
      await loadOpen();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function voidBill() {
    if (!selected || !voidReason.trim()) return;
    setBusy(true);
    try {
      await postJson(`/api/bills/${selected}/void`, { reason: voidReason });
      setNotice("Bill voided.");
      setVoidReason("");
      await loadBill(selected);
      await loadOpen();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function reopenBill() {
    if (!selected || !reopenReason.trim()) return;
    setBusy(true);
    try {
      const view = await postJson<BillViewDto>(`/api/bills/${selected}/reopen`, {
        reason: reopenReason,
      });
      setBill(view);
      setReopenReason("");
      setNotice("Bill reopened. Previous payments were reversed.");
      await loadOpen();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancelItem() {
    if (!voiding || !voiding.reason.trim()) return;
    setBusy(true);
    try {
      await postJson(`/api/order-items/${voiding.itemId}/cancel`, { reason: voiding.reason });
      setVoiding(null);
      await reloadSelected();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (unauthorized) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-5">
        <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <h1 className="text-xl font-semibold">Reception sign in</h1>
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
    <main className="min-h-screen px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reception</h1>
          <p className="text-xs text-slate-400">
            {snapshot?.me.name ?? "Reception"} · {sessions.length} open visits
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge status={stream} />
          <button type="button" className={BTN} onClick={() => void signOut()}>
            Out
          </button>
        </div>
      </header>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}
      {escalated.length > 0 ? (
        <div className="mt-3 animate-pulse rounded-xl border-2 border-red-500 bg-red-500/15 px-4 py-2 text-sm text-red-100">
          <strong>Waiter not responding:</strong>{" "}
          {escalated.map((task) => task.text).join(" · ")}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Open visits
          </h2>
          {sessions.length === 0 ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
              No open visits. New tables will appear here.
            </p>
          ) : (
            sessions.map((row) => (
              <button
                key={row.sessionId}
                type="button"
                onClick={() => void selectSession(row.sessionId)}
                className={`w-full rounded-xl border p-3 text-left ${
                  selected === row.sessionId
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : row.billRequested
                      ? "border-orange-500/50 bg-orange-500/10"
                      : "border-slate-800 bg-slate-900/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">
                      {row.tableLabel ?? "Parcel"}
                      {row.zoneName ? (
                        <span className="ml-2 text-[11px] font-normal text-slate-400">
                          {row.zoneName} · {row.isAc ? "AC" : "Non-AC"}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {row.itemCount} items · {ist(row.openedAt)}
                    </p>
                  </div>
                  <p className="font-mono text-sm">{money(row.totalPaise)}</p>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                    {row.state.replace(/_/g, " ")}
                  </span>
                  {row.billNumber ? (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                      {row.billNumber}
                    </span>
                  ) : null}
                  {row.billRequested ? (
                    <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] text-orange-200">
                      Bill requested
                    </span>
                  ) : null}
                  {row.escalatedTasks > 0 ? (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-200">
                      Waiter not responding
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </aside>

        {!selected || !bill ? (
          <section className="flex min-h-[300px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/40 text-sm text-slate-500">
            Select a table to open its bill.
          </section>
        ) : (
          <section className="space-y-3">
            <div className="no-print flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    bill.bill?.status === "PAID"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : bill.bill?.status === "VOID"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {bill.bill?.status ?? "DRAFT"}
                </span>
                <span className="text-xs text-slate-400">
                  {bill.table ? `Table ${bill.table.label}` : "Parcel"} ·{" "}
                  {bill.table?.zoneName ?? "Takeaway"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="text-xs text-slate-400">
                  Print format
                  <select
                    value={printFormat}
                    onChange={(event) => setPrintFormat(event.target.value as "80mm" | "a4")}
                    className="ml-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
                  >
                    <option value="80mm">80 mm thermal</option>
                    <option value="a4">A4</option>
                  </select>
                </label>
                <button type="button" className={BTN} onClick={() => window.print()}>
                  Print
                </button>
              </div>
            </div>

            <div className="bill-print" data-format={printFormat}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "1.2em", fontWeight: 700 }}>{bill.restaurant.name}</p>
                {bill.restaurant.address ? <p>{bill.restaurant.address}</p> : null}
                {bill.restaurant.phone ? <p>{bill.restaurant.phone}</p> : null}
                {bill.restaurant.gstin ? <p>GSTIN: {bill.restaurant.gstin}</p> : null}
              </div>
              <hr />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Bill: {bill.bill?.billNumber ?? "DRAFT"}</span>
                <span>
                  {ist(bill.bill?.paidAt ?? new Date().toISOString())}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {bill.table ? `Table ${bill.table.label} · ${bill.table.zoneName}` : "Parcel"}
                </span>
                <span>{bill.items.reduce((sum, item) => sum + item.qty, 0)} items</span>
              </div>
              <hr />
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="amount">Qty</th>
                    <th className="amount">Rate</th>
                    <th className="amount">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.name} <span style={{ opacity: 0.7 }}>({item.variant})</span>
                        {item.note ? <div style={{ fontSize: "0.9em" }}>{item.note}</div> : null}
                      </td>
                      <td className="amount">{item.qty}</td>
                      <td className="amount">{money(item.unitPricePaise)}</td>
                      <td className="amount">{money(item.lineTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {bill.bill && bill.bill.adjustments.length > 0 ? (
                <>
                  <hr />
                  {bill.bill.adjustments.map((adjustment) => (
                    <div key={adjustment.id} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>
                        {adjustment.label}
                        {adjustment.kind === "DISCOUNT" ? " (discount)" : ""}
                      </span>
                      <span className="amount">
                        {adjustment.kind === "DISCOUNT" ? "-" : ""}
                        {money(adjustment.amountPaise)}
                      </span>
                    </div>
                  ))}
                </>
              ) : null}

              <hr />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Subtotal</span>
                <span className="amount">{money(bill.draft.subtotalPaise)}</span>
              </div>
              {bill.draft.extrasPaise > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Extras</span>
                  <span className="amount">{money(bill.draft.extrasPaise)}</span>
                </div>
              ) : null}
              {bill.draft.surchargePaise > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Surcharge</span>
                  <span className="amount">{money(bill.draft.surchargePaise)}</span>
                </div>
              ) : null}
              {bill.draft.discountPaise > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Discount</span>
                  <span className="amount">-{money(bill.draft.discountPaise)}</span>
                </div>
              ) : null}
              {bill.draft.taxPaise > 0 ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Taxable value</span>
                    <span className="amount">{money(bill.draft.taxableAmountPaise)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>CGST ({bill.taxRatePercent / 2}%)</span>
                    <span className="amount">{money(bill.draft.cgstPaise)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>SGST ({bill.taxRatePercent / 2}%)</span>
                    <span className="amount">{money(bill.draft.sgstPaise)}</span>
                  </div>
                  {bill.taxInclusive ? (
                    <p style={{ fontSize: "0.9em", opacity: 0.8 }}>Tax included in prices.</p>
                  ) : null}
                </>
              ) : null}
              {bill.draft.roundOffPaise !== 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Round off</span>
                  <span className="amount">{money(bill.draft.roundOffPaise)}</span>
                </div>
              ) : null}
              <hr />
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>TOTAL</span>
                <span className="amount">{money(bill.draft.totalPaise)}</span>
              </div>

              {bill.bill && bill.bill.payments.length > 0 ? (
                <>
                  <hr />
                  {bill.bill.payments.map((payment) => (
                    <div key={payment.id} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{payment.method}</span>
                      <span className="amount">{money(payment.amountPaise)}</span>
                    </div>
                  ))}
                </>
              ) : null}

              {bill.restaurant.billFooter ? (
                <>
                  <hr />
                  <p style={{ textAlign: "center" }}>{bill.restaurant.billFooter}</p>
                </>
              ) : null}
              <p style={{ textAlign: "center", fontSize: "0.8em", opacity: 0.65 }}>
                DineSense · {bill.bill?.status ?? "DRAFT"}
              </p>
            </div>

            {voiding ? (
              <div className="no-print rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                <p className="text-sm text-red-200">Void {voiding.name}</p>
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    value={voiding.reason}
                    onChange={(event) => setVoiding({ ...voiding, reason: event.target.value })}
                    placeholder="Reason (required)"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                  <button type="button" className={BTN} disabled={busy || !voiding.reason.trim()} onClick={() => void cancelItem()}>
                    Confirm void
                  </button>
                  <button type="button" className={BTN} onClick={() => setVoiding(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {bill.bill?.status === "OPEN" ? (
              <div className="no-print grid gap-3 xl:grid-cols-2">
                <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Items · void before payment
                  </h2>
                  <ul className="mt-2 space-y-1 text-sm">
                    {bill.items
                      .filter((item) => ["PLACED", "PREPARING", "READY"].includes(item.orderStatus))
                      .map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {item.qty}× {item.name} ({item.variant}) · {item.orderStatus}
                          </span>
                          <button
                            type="button"
                            className="text-xs text-red-300"
                            disabled={busy}
                            onClick={() => setVoiding({ itemId: item.id, name: item.name, reason: "" })}
                          >
                            Void
                          </button>
                        </li>
                      ))}
                    {bill.items.every((item) => !["PLACED", "PREPARING", "READY"].includes(item.orderStatus)) ? (
                      <li className="text-slate-500">No voidable items.</li>
                    ) : null}
                  </ul>
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Extras
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {bill.quickExtras.map((extra) => (
                      <button
                        key={extra.variantId}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(async () =>
                            postJson<BillViewDto>(`/api/bills/${bill.sessionId}/adjustments`, {
                              kind: "EXTRA",
                              label: `${extra.name} (${extra.variant})`,
                              amountPaise: extra.pricePaise,
                            }),
                          )
                        }
                        className={BTN}
                      >
                        {extra.name} {money(extra.pricePaise)}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={extraLabel}
                      onChange={(event) => setExtraLabel(event.target.value)}
                      placeholder="Custom extra"
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                    />
                    <input
                      value={extraRupees}
                      onChange={(event) => setExtraRupees(event.target.value)}
                      inputMode="decimal"
                      placeholder="₹"
                      className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                    />
                    <button
                      type="button"
                      className={BTN}
                      disabled={busy || rupeesToPaise(extraRupees) <= 0}
                      onClick={() =>
                        void act(async () => {
                          const view = await postJson<BillViewDto>(
                            `/api/bills/${bill.sessionId}/adjustments`,
                            {
                              kind: "EXTRA",
                              label: extraLabel.trim() || "Extra",
                              amountPaise: rupeesToPaise(extraRupees),
                            },
                          );
                          setExtraLabel("");
                          setExtraRupees("");
                          return view;
                        })
                      }
                    >
                      Add
                    </button>
                  </div>

                  <h2 className="mt-4 text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Discount
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={discountPercent}
                      onChange={(event) => setDiscountPercent(event.target.value)}
                      inputMode="numeric"
                      placeholder="%"
                      className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                    />
                    <button
                      type="button"
                      className={BTN}
                      disabled={busy || Number(discountPercent) <= 0 || Number(discountPercent) > 100}
                      onClick={() =>
                        void act(async () => {
                          const view = await postJson<BillViewDto>(
                            `/api/bills/${bill.sessionId}/adjustments`,
                            { kind: "DISCOUNT", percent: Number(discountPercent) },
                          );
                          setDiscountPercent("");
                          return view;
                        })
                      }
                    >
                      Add %
                    </button>
                    <input
                      value={discountRupees}
                      onChange={(event) => setDiscountRupees(event.target.value)}
                      inputMode="decimal"
                      placeholder="₹ discount"
                      className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs"
                    />
                    <button
                      type="button"
                      className={BTN}
                      disabled={busy || rupeesToPaise(discountRupees) <= 0}
                      onClick={() =>
                        void act(async () => {
                          const view = await postJson<BillViewDto>(
                            `/api/bills/${bill.sessionId}/adjustments`,
                            {
                              kind: "DISCOUNT",
                              amountPaise: rupeesToPaise(discountRupees),
                            },
                          );
                          setDiscountRupees("");
                          return view;
                        })
                      }
                    >
                      Add amount
                    </button>
                  </div>

                  {bill.bill && bill.bill.adjustments.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {bill.bill.adjustments.map((adjustment) => (
                        <li key={adjustment.id} className="flex items-center justify-between gap-2">
                          <span>
                            {adjustment.label} · {money(adjustment.amountPaise)}
                          </span>
                          <button
                            type="button"
                            className="text-red-300"
                            disabled={busy}
                            onClick={() =>
                              void act(() =>
                                fetch(`/api/bills/${bill.sessionId}/adjustments`, {
                                  method: "DELETE",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ adjustmentId: adjustment.id }),
                                }).then(async (response) => {
                                  if (!response.ok) throw new Error("Could not remove adjustment");
                                  return (await response.json()) as BillViewDto;
                                }),
                              )
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 xl:col-span-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Payment
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Total <span className="font-semibold">{money(totalPaise)}</span> · entered{" "}
                    {money(enteredPaise)}
                    {changePaise > 0 ? ` · change ${money(changePaise)}` : ""}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {[
                      { label: "Cash", value: cash, set: setCash },
                      { label: "UPI", value: upi, set: setUpi },
                      { label: "Card", value: card, set: setCard },
                    ].map((field) => (
                      <label key={field.label} className="text-xs text-slate-400">
                        {field.label} ₹
                        <input
                          value={field.value}
                          onChange={(event) => field.set(event.target.value)}
                          inputMode="decimal"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={BTN}
                      onClick={() => {
                        const remaining = Math.max(0, totalPaise - rupeesToPaise(upi) - rupeesToPaise(card));
                        setCash((remaining / 100).toFixed(2));
                      }}
                    >
                      Fill with cash
                    </button>
                    <button
                      type="button"
                      className={`${BTN_PRIMARY} flex-1`}
                      disabled={busy || enteredPaise < totalPaise || (totalPaise > 0 && enteredPaise === 0)}
                      onClick={() => void pay()}
                    >
                      {busy ? "Working…" : "Take payment & close"}
                    </button>
                  </div>
                </section>

                <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 xl:col-span-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-red-300">
                    Void bill
                  </h2>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={voidReason}
                      onChange={(event) => setVoidReason(event.target.value)}
                      placeholder="Reason (required, audited)"
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      className={BTN}
                      disabled={busy || voidReason.trim().length < 3}
                      onClick={() => void voidBill()}
                    >
                      Void bill
                    </button>
                  </div>
                </section>
              </div>
            ) : bill.bill?.status === "PAID" ? (
              <div className="no-print space-y-3">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-200">
                  Paid {bill.bill.paidAt ? ist(bill.bill.paidAt) : ""}. The table is waiting to be
                  cleaned.
                </div>
                {isAdmin ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Reopen (admin, audited)
                    </h2>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={reopenReason}
                        onChange={(event) => setReopenReason(event.target.value)}
                        placeholder="Reason (required)"
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        className={BTN}
                        disabled={busy || reopenReason.trim().length < 3}
                        onClick={() => void reopenBill()}
                      >
                        Reopen bill
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Reopening removes the recorded payments (kept in the audit log).
                    </p>
                  </div>
                ) : null}
              </div>
            ) : bill.bill?.status === "VOID" ? (
              <div className="no-print rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-200">
                This bill was voided. The table is free.
              </div>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
