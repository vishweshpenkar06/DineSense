"use client";

import type { DayCloseDto } from "@dinesense/core";
import { errorMessage, getJson, postJson } from "@/lib/client";
import { useEffect, useState, type FormEvent } from "react";
import { BTN_PRIMARY, CARD, INPUT, money } from "./ui";

function todayString(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function DayClosePanel() {
  const [date, setDate] = useState(todayString);
  const [data, setData] = useState<DayCloseDto | null>(null);
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(day: string) {
    setBusy(true);
    try {
      const next = await getJson<DayCloseDto>(`/api/admin/day-close?date=${day}`);
      setData(next);
      setCash(next.countedCashPaise ? String(next.countedCashPaise / 100) : "");
      setNote(next.note ?? "");
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const next = await postJson<DayCloseDto>("/api/admin/day-close", {
        businessDay: date,
        countedCashPaise: Math.round(Number(cash || 0) * 100),
        note: note || null,
      });
      setData(next);
      setCash(next.countedCashPaise ? String(next.countedCashPaise / 100) : "");
      setNotice(`Day ${next.businessDay} closed. Variance ${money(next.variancePaise)}.`);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const variance = data?.variancePaise ?? 0;

  return (
    <section className="mt-4 space-y-4">
      <div className={CARD}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Daily cash close</h2>
            <p className="mt-1 text-xs text-muted">
              Match the cash drawer against paid bills. UPI and card totals are shown for reconciliation.
            </p>
          </div>
          <label className="text-xs text-muted">
            Business day
            <input
              type="date"
              value={date}
              max={todayString()}
              onChange={(event) => setDate(event.target.value)}
              className={`${INPUT} mt-1`}
            />
          </label>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-coral/30 bg-coral/[0.08] px-4 py-3 text-sm text-coral">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-jade/25 bg-jade/[0.06] px-4 py-3 text-sm text-jade">
          {notice}
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-3">
            {[
              { label: "Expected cash", value: data.expectedCashPaise, tone: "text-jade" },
              { label: "UPI collected", value: data.expectedUpiPaise, tone: "text-accent" },
              { label: "Card collected", value: data.expectedCardPaise, tone: "text-muted" },
            ].map((row) => (
              <div key={row.label} className={`${CARD} flex items-center justify-between`}>
                <span className="text-sm text-muted">{row.label}</span>
                <span className={`font-display text-2xl ${row.tone}`}>{money(row.value)}</span>
              </div>
            ))}
            <div
              className={`${CARD} flex items-center justify-between border ${
                variance === 0
                  ? "border-jade/30"
                  : variance < 0
                    ? "border-coral/40"
                    : "border-accent/40"
              }`}
            >
              <span className="text-sm text-muted">Cash variance</span>
              <span
                className={`font-display text-2xl ${
                  variance === 0 ? "text-jade" : variance < 0 ? "text-coral" : "text-accent"
                }`}
              >
                {money(variance)}
              </span>
            </div>
          </div>

          <form className={`${CARD} space-y-3`} onSubmit={(event) => void save(event)}>
            <h3 className="text-sm font-semibold text-ink">Count the drawer</h3>
            {data.changedSinceClose ? (
              <p className="text-xs text-coral">Changed since close. Review this day again.</p>
            ) : null}
            <label className="block text-xs text-muted">
              Counted cash (₹)
              <input
                type="number"
                min={0}
                step="0.01"
                value={cash}
                onChange={(event) => setCash(event.target.value)}
                placeholder="0.00"
                className={`${INPUT} mt-1`}
                required
              />
            </label>
            <label className="block text-xs text-muted">
              Note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Change fund, expenses, handover…"
                className={`${INPUT} mt-1 resize-none`}
              />
            </label>
            <button type="submit" className={`${BTN_PRIMARY} w-full py-2.5`} disabled={busy}>
              {busy ? "Saving…" : data.closedAt ? "Update day close" : "Close day"}
            </button>
            {data.closedAt ? (
              <p className="text-[11px] text-faint">
                Last saved {new Date(data.closedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              </p>
            ) : null}
          </form>
        </div>
      ) : (
        <div className={`${CARD} text-sm text-muted`}>{busy ? "Loading day close…" : "No data."}</div>
      )}
    </section>
  );
}
