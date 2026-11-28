"use client";

import type { BillViewDto, OpenBillRowDto } from "@dinesense/core";
import { receiptHeading } from "@dinesense/core/billing";
import { Brand, BrandMark } from "@/components/brand";
import { ConnectionBadge } from "@/components/connection-badge";
import { UpiQr, upiPayUri } from "@/components/upi-qr";
import { errorMessage, getJson, postJson } from "@/lib/client";
import { useSnapshotLive } from "@/lib/live";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Printer,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const BTN =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-slate-600 hover:bg-raised disabled:opacity-40";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-canvas transition hover:bg-[#efc05e] disabled:bg-raised disabled:text-faint disabled:hover:bg-raised";

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
  const [healthStatus, setHealthStatus] = useState<string | null>(null);

  const isAdmin = snapshot?.me.role === "ADMIN";
  const upiUri = bill?.restaurant.upiId
    ? upiPayUri({
        upiId: bill.restaurant.upiId,
        name: bill.restaurant.upiName,
        amountPaise: bill.draft.totalPaise,
        note: bill.bill?.billNumber ? `Bill ${bill.bill.billNumber}` : "DineSense order",
      })
    : null;

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
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void loadOpen();
    let active = true;
    const loadHealth = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = (await response.json()) as { ok: boolean; status: string };
        if (active) setHealthStatus(data.ok ? data.status : "down");
      } catch {
        if (active) setHealthStatus("down");
      }
    };
    void loadHealth();
    const timer = setInterval(loadHealth, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
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

  async function issue() {
    if (!selected) return;
    await act(() => postJson<BillViewDto>(`/api/bills/${selected}/issue`, {}));
  }

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
    <main className="mx-auto min-h-[100dvh] max-w-7xl px-4 pb-10 pt-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-8 w-8 shrink-0 text-accent sm:hidden" />
          <Brand compact className="hidden sm:inline-flex" />
          <span className="hidden h-7 w-px bg-line sm:block" />
          <div className="min-w-0">
            <h1 className="font-display text-[1.7rem] font-medium leading-none tracking-[-0.02em] sm:text-3xl">
              Reception
            </h1>
            <p className="mt-1 truncate text-xs text-muted">
              {snapshot?.me.name ?? "Reception"} · {sessions.length} open {sessions.length === 1 ? "visit" : "visits"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConnectionBadge status={stream} />
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

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-faint">Open visits</h2>
            <span className="text-[11px] text-faint">{sessions.length}</span>
          </div>
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
              <ReceiptText className="mx-auto h-5 w-5 text-faint" />
              <p className="mt-2 text-sm text-muted">No open visits.</p>
              <p className="mt-0.5 text-xs text-faint">New tables will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((row) => (
                <button
                  key={row.sessionId}
                  type="button"
                  onClick={() => void selectSession(row.sessionId)}
                  className={`group w-full rounded-2xl border p-3.5 text-left transition ${
                    selected === row.sessionId
                      ? "border-accent/50 bg-accent/[0.07]"
                      : row.billRequested
                        ? "border-clay/40 bg-clay/[0.04] hover:border-clay/60"
                        : "border-line bg-surface hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-semibold leading-none">
                        {row.tableLabel ?? "Parcel"}
                        {row.zoneName ? (
                          <span className="ml-2 text-[11px] font-normal text-muted">
                            {row.zoneName} · {row.isAc ? "AC" : "Non-AC"}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1.5 text-[11px] text-faint">
                        {row.itemCount} {row.itemCount === 1 ? "item" : "items"} · {ist(row.openedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <p className="text-sm font-semibold tabular-nums">{money(row.totalPaise)}</p>
                      <ChevronRight className="h-3.5 w-3.5 text-faint transition group-hover:translate-x-0.5" />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] capitalize text-muted">
                      {row.state.replace(/_/g, " ")}
                    </span>
                    {row.billNumber ? (
                      <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-faint">
                        {row.billNumber}
                      </span>
                    ) : null}
                    {row.billRequested ? (
                      <span className="rounded-full border border-clay/30 bg-clay/[0.1] px-2 py-0.5 text-[10px] font-medium text-clay">
                        Bill requested
                      </span>
                    ) : null}
                    {row.escalatedTasks > 0 ? (
                      <span className="rounded-full border border-coral/30 bg-coral/[0.1] px-2 py-0.5 text-[10px] font-medium text-coral">
                        Waiter not responding
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {error ? (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-coral/30 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-jade/25 bg-jade/[0.07] px-4 py-3 text-sm text-jade">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
            </div>
          ) : null}
          {snapshot?.settings.SHADOW_MODE ? (
            <div className="mb-3 rounded-2xl border border-accent/25 bg-accent/[0.06] px-4 py-3 text-xs text-accent">
              Pilot shadow mode — keep paper bills as the backup until the owner signs off.
            </div>
          ) : null}
          {healthStatus && healthStatus !== "ok" ? (
            <div className="mb-3 rounded-2xl border border-coral/30 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
              System health is {healthStatus}. Check Admin → Health (database, worker, disk, backup).
            </div>
          ) : null}
          {escalated.length > 0 ? (
            <div className="mb-3 rounded-2xl border border-coral/40 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
              <strong>Waiter not responding:</strong> {escalated.map((task) => task.text).join(" · ")}
            </div>
          ) : null}

          {!selected || !bill ? (
            <section className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl border border-dashed border-line px-5 text-center">
              <ReceiptText className="h-6 w-6 text-faint" />
              <p className="mt-2 text-sm text-muted">Select a table to open its bill.</p>
              <p className="mt-0.5 text-xs text-faint">Extras, discounts and payment live here.</p>
            </section>
          ) : (
            <section className="space-y-3">
              <div className="no-print flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                      bill.bill?.status === "PAID"
                        ? "border-jade/30 bg-jade/[0.1] text-jade"
                        : bill.bill?.status === "VOID"
                          ? "border-coral/30 bg-coral/[0.1] text-coral"
                          : "border-line bg-surface text-muted"
                    }`}
                  >
                    {bill.bill?.status ?? "DRAFT"}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {bill.table ? `Table ${bill.table.label}` : "Parcel"} · {bill.table?.zoneName ?? "Takeaway"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    aria-label="Print format"
                    value={printFormat}
                    onChange={(event) => setPrintFormat(event.target.value as "80mm" | "a4")}
                    className="rounded-xl border border-line bg-surface px-2.5 py-2 text-xs text-muted outline-none"
                  >
                    <option value="80mm">80 mm thermal</option>
                    <option value="a4">A4</option>
                  </select>
                  <button type="button" className={BTN} onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> Print
                  </button>
                </div>
              </div>

<div className="bill-print" data-format={printFormat}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "1.2em", fontWeight: 700 }}>{bill.restaurant.name}</p>
                <p style={{ fontWeight: 700 }}>
                  {receiptHeading(bill.restaurant.registrationType, Boolean(bill.bill?.billNumber))}
                </p>
                {bill.restaurant.address ? <p>{bill.restaurant.address}</p> : null}
                {bill.restaurant.phone ? <p>{bill.restaurant.phone}</p> : null}
                {bill.restaurant.gstin ? <p>GSTIN: {bill.restaurant.gstin}</p> : null}
                {bill.restaurant.fssai ? <p>FSSAI: {bill.restaurant.fssai}</p> : null}
                {bill.restaurant.registrationType === "COMPOSITION" ? (
                  <p style={{ fontSize: "0.9em" }}>
                    Composition taxable person, not eligible to collect tax on supplies.
                  </p>
                ) : null}
              </div>
              <hr />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {bill.bill?.billNumber
                    ? `Bill: ${bill.bill.billNumber}`
                    : "ESTIMATE - not a tax invoice"}
                </span>
                <span>
                  {ist(bill.bill?.paidAt ?? new Date().toISOString())}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {bill.table ? `Table ${bill.table.label} · ${bill.table.zoneName}` : "Parcel"}
                </span>
                <span>
                  {bill.items.reduce((sum, item) => sum + item.qty, 0)}{" "}
                  {bill.items.reduce((sum, item) => sum + item.qty, 0) === 1 ? "item" : "items"}
                </span>
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
                        {item.hsnCode ? <div style={{ fontSize: "0.85em", opacity: 0.65 }}>HSN {item.hsnCode}</div> : null}
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
              {(bill.draft.serviceChargePaise ?? 0) > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Service charge</span>
                  <span className="amount">{money(bill.draft.serviceChargePaise ?? 0)}</span>
                </div>
              ) : null}
              {bill.draft.taxPaise > 0 ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Taxable value</span>
                    <span className="amount">{money(bill.draft.taxableAmountPaise)}</span>
                  </div>
                  {bill.draft.taxBreakup && bill.draft.taxBreakup.length > 0 ? (
                    bill.draft.taxBreakup.map((line) => (
                      <div key={line.ratePercent} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>
                          GST {line.ratePercent}% (CGST {line.ratePercent / 2}% + SGST {line.ratePercent / 2}%)
                        </span>
                        <span className="amount">{money(line.taxPaise)}</span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>CGST ({bill.taxRatePercent / 2}%)</span>
                        <span className="amount">{money(bill.draft.cgstPaise)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>SGST ({bill.taxRatePercent / 2}%)</span>
                        <span className="amount">{money(bill.draft.sgstPaise)}</span>
                      </div>
                    </>
                  )}
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

              {bill.restaurant.upiQrUrl || upiUri ? (
                <div style={{ textAlign: "center", marginTop: "10px" }}>
                  <p style={{ fontSize: "0.9em", fontWeight: 600 }}>
                    Scan to pay {money(bill.draft.totalPaise)} via UPI
                  </p>
                  {bill.restaurant.upiQrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={bill.restaurant.upiQrUrl}
                      alt="Shop UPI QR"
                      style={{ width: "96px", height: "96px", objectFit: "contain", margin: "0 auto" }}
                    />
                  ) : upiUri ? (
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <UpiQr value={upiUri} size={96} />
                    </div>
                  ) : null}
                  {bill.restaurant.upiId ? <p>{bill.restaurant.upiId}</p> : null}
                </div>
              ) : null}

              {bill.bill && bill.bill.payments.length > 0 ? (
                <>
                  <hr />
                  {bill.bill.payments.map((payment) => (
                    <div key={payment.id}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>
                          {payment.method}
                          {payment.tenderedPaise !== null && payment.tenderedPaise !== payment.amountPaise
                            ? ` (tendered ${money(payment.tenderedPaise)})`
                            : ""}
                        </span>
                        <span className="amount">{money(payment.amountPaise)}</span>
                      </div>
                      {payment.changePaise > 0 ? (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Change</span>
                          <span className="amount">{money(payment.changePaise)}</span>
                        </div>
                      ) : null}
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
              <div className="no-print rounded-2xl border border-coral/30 bg-coral/[0.06] p-4">
                <p className="text-sm text-red-200">Void {voiding.name}</p>
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    value={voiding.reason}
                    onChange={(event) => setVoiding({ ...voiding, reason: event.target.value })}
                    placeholder="Reason (required)"
                    className="flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent/50"
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
                <section className="rounded-2xl border border-line bg-surface p-4">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
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
                            className="text-[11px] font-medium text-coral"
                            disabled={busy}
                            onClick={() => setVoiding({ itemId: item.id, name: item.name, reason: "" })}
                          >
                            Void
                          </button>
                        </li>
                      ))}
                    {bill.items.every((item) => !["PLACED", "PREPARING", "READY"].includes(item.orderStatus)) ? (
                      <li className="text-faint">No voidable items.</li>
                    ) : null}
                  </ul>
                </section>

                <section className="rounded-2xl border border-line bg-surface p-4">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
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
                      className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs text-ink outline-none placeholder:text-faint focus:border-accent/50"
                    />
                    <input
                      value={extraRupees}
                      onChange={(event) => setExtraRupees(event.target.value)}
                      inputMode="decimal"
                      placeholder="₹"
                      className="w-20 rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs text-ink outline-none placeholder:text-faint focus:border-accent/50"
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

                  <h2 className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Discount
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={discountPercent}
                      onChange={(event) => setDiscountPercent(event.target.value)}
                      inputMode="numeric"
                      placeholder="%"
                      className="w-20 rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs text-ink outline-none placeholder:text-faint focus:border-accent/50"
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
                      className="w-28 rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs text-ink outline-none placeholder:text-faint focus:border-accent/50"
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
                            className="text-coral"
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

                <section className="rounded-2xl border border-line bg-surface p-4 xl:col-span-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Payment
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Total <span className="font-semibold">{money(totalPaise)}</span> · entered{" "}
                    {money(enteredPaise)}
                    {changePaise > 0 ? ` · change ${money(changePaise)}` : ""}
                  </p>
                  {bill.restaurant.upiQrUrl || upiUri ? (
                    <div className="mt-3 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-canvas/50 p-3">
                      {bill.restaurant.upiQrUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={bill.restaurant.upiQrUrl}
                          alt="Shop UPI QR"
                          className="h-36 w-36 rounded-xl bg-white object-contain p-2"
                        />
                      ) : upiUri ? (
                        <UpiQr value={upiUri} size={132} />
                      ) : null}
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-ink">Scan to pay by UPI</p>
                        <p className="mt-1 text-muted">
                          {bill.restaurant.upiName ?? "Shop"} · {money(totalPaise)}
                        </p>
                        {bill.restaurant.upiId ? (
                          <p className="mt-0.5 text-xs text-faint">{bill.restaurant.upiId}</p>
                        ) : null}
                        <p className="mt-2 text-xs text-muted">
                          After the customer pays, enter the UPI amount and confirm.
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {bill.bill?.status === "OPEN" && !bill.bill.billNumber ? (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/[0.06] px-3 py-2 text-xs text-accent">
                      <span>Estimate only. Issue a bill number before the tax invoice.</span>
                      <button
                        type="button"
                        className={BTN}
                        disabled={busy}
                        onClick={() => void issue()}
                      >
                        Issue bill
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {[
                      { label: "Cash", value: cash, set: setCash },
                      { label: "UPI", value: upi, set: setUpi },
                      { label: "Card", value: card, set: setCard },
                    ].map((field) => (
                      <label key={field.label} className="text-[11px] text-faint">
                        {field.label} ₹
                        <input
                          value={field.value}
                          onChange={(event) => field.set(event.target.value)}
                          inputMode="decimal"
                          className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent/50"
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
                      disabled={busy || totalPaise === 0 || enteredPaise < totalPaise}
                      onClick={() => void pay()}
                    >
                      {busy ? "Working…" : "Take payment & close"}
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border border-coral/25 bg-coral/[0.04] p-4 xl:col-span-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-coral">
                    Void bill
                  </h2>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={voidReason}
                      onChange={(event) => setVoidReason(event.target.value)}
                      placeholder="Reason (required, audited)"
                      className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent/50"
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
                <div className="rounded-2xl border border-jade/25 bg-jade/[0.05] p-4 text-sm text-jade">
                  Paid {bill.bill.paidAt ? ist(bill.bill.paidAt) : ""}. The table is waiting to be
                  cleaned.
                </div>
                {isAdmin ? (
                  <div className="rounded-2xl border border-line bg-surface p-4">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Reopen (admin, audited)
                    </h2>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={reopenReason}
                        onChange={(event) => setReopenReason(event.target.value)}
                        placeholder="Reason (required)"
                        className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent/50"
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
                    <p className="mt-1 text-[11px] text-faint">
                      Reopening removes the recorded payments (kept in the audit log).
                    </p>
                  </div>
                ) : null}
              </div>
            ) : bill.bill?.status === "VOID" ? (
              <div className="no-print rounded-2xl border border-coral/25 bg-coral/[0.04] p-4 text-sm text-coral">
                This bill was voided. The table is free.
              </div>
            ) : null}
          </section>
        )}
        </div>
      </div>
    </main>
  );
}
