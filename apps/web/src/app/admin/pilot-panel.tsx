"use client";

import type { PilotReviewDto } from "@dinesense/core";
import { errorMessage, getJson } from "@/lib/client";
import { useCallback, useEffect, useState } from "react";
import { BTN, BTN_PRIMARY, CARD, INPUT } from "./ui";

function ist(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
}

export function PilotPanel() {
  const [review, setReview] = useState<PilotReviewDto | null>(null);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (wanted?: string) => {
    setBusy(true);
    setError(null);
    try {
      const query = wanted ? `?date=${wanted}` : "";
      const data = await getJson<PilotReviewDto>(`/api/admin/pilot/review${query}`);
      setReview(data);
      setDate(data.date);
      setNotes(data.notes);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveNotes() {
    if (!review) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/pilot/notes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: review.date, note: notes }),
      });
      if (!response.ok) throw new Error("Could not save the pilot note");
      setNotice("Pilot note saved. Use it as the fix list for this service day.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-400">
          Business day
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              if (event.target.value) void load(event.target.value);
            }}
            className={`${INPUT} mt-1`}
          />
        </label>
        <button type="button" className={`${BTN} self-end`} disabled={busy} onClick={() => void load(date || undefined)}>
          Refresh
        </button>
        {review?.shadowMode ? (
          <span className="self-end rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
            Shadow mode on
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <p className="text-xs text-slate-500">
        Compares what the camera reported with every manual table correction in the business day.
        Tune the seated/empty windows in Admin → Settings after reviewing the Cameras → Tuning log.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Manual overrides", review?.summary.overrides ?? 0],
          ["Camera/staff mismatches", review?.summary.mismatches ?? 0],
          ["Camera events", review?.summary.cameraEvents ?? 0],
          ["Abandoned tables", review?.summary.abandonedVisits ?? 0],
          ["Waiting alerts", review?.summary.needsOrderAlerts ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className={CARD}>
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                label === "Camera/staff mismatches" && Number(value) > 0 ? "text-amber-300" : "text-white"
              }`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className={CARD}>
        <h2 className="text-sm font-semibold text-slate-300">Manual corrections by table</h2>
        {review?.tables.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left">Table</th>
                  <th className="text-left">Floor</th>
                  <th className="text-right">Occupied events</th>
                  <th className="text-right">Empty events</th>
                  <th className="text-right">Overrides</th>
                  <th className="text-right">Mismatches</th>
                </tr>
              </thead>
              <tbody>
                {review.tables.map((table) => (
                  <tr
                    key={table.tableId}
                    className={`border-t border-slate-800 ${table.mismatches > 0 ? "text-amber-200" : ""}`}
                  >
                    <td className="py-1">{table.label}</td>
                    <td>{table.zoneName}</td>
                    <td className="text-right font-mono">{table.occupiedEvents}</td>
                    <td className="text-right font-mono">{table.emptyEvents}</td>
                    <td className="text-right font-mono">{table.overrides}</td>
                    <td className="text-right font-mono">{table.mismatches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No camera events or manual corrections yet.</p>
        )}
      </div>

      <div className={CARD}>
        <h2 className="text-sm font-semibold text-slate-300">Corrections and camera disagreement</h2>
        {review?.overrides.length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {[...review.overrides].reverse().map((override) => (
              <li
                key={override.id}
                className={`rounded-lg border px-3 py-2 ${
                  override.mismatch
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-slate-800 bg-slate-950/40"
                }`}
              >
                <p>
                  <span className="font-medium">{override.tableLabel ?? "Table"}</span>
                  {override.zoneName ? ` · ${override.zoneName}` : ""} · {ist(override.at)} ·{" "}
                  {override.actorName}
                </p>
                <p className="text-xs text-slate-400">
                  Staff set {override.fromState} → {override.toState}. Camera last said{" "}
                  {override.visionState ?? "nothing yet"}.
                  {override.mismatch ? (
                    <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                      mismatch
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No manual overrides. That is either excellent camera accuracy or a quiet day.
          </p>
        )}
      </div>

      <div className={CARD}>
        <h2 className="text-sm font-semibold text-slate-300">Daily pilot note / fix list</h2>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={5}
          placeholder="Complaints, threshold changes to try, tables the camera struggles with, fixes for tomorrow…"
          className={`${INPUT} mt-2`}
        />
        <button type="button" className={`${BTN_PRIMARY} mt-2`} disabled={busy} onClick={() => void saveNotes()}>
          Save pilot note
        </button>
      </div>
    </div>
  );
}
