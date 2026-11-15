"use client";

import { useEffect, useState } from "react";
import { BTN, CARD } from "./ui";

type Health = {
  ok: boolean;
  status: "ok" | "degraded" | "down";
  serverNow: string;
  database: { ok: boolean; latencyMs: number; now: string | null; error: string | null };
  worker: { lastTick: string | null; healthy: boolean };
  disk: { freeBytes: number; totalBytes: number; freeGb: number } | null;
  lastBackupAt: string | null;
  clockSkewMs: number | null;
  cameras: Array<{ id: string; name: string; zoneName: string; status: string; fps: number | null }>;
  node: string;
  uptimeS: number;
};

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(iso));
}

export function HealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = (await response.json()) as Health;
        if (active) {
          setHealth(data);
          setError(null);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Health check failed");
      }
    };
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {health ? (
        <div
          className={`rounded-xl border px-4 py-3 font-medium ${
            health.ok
              ? health.status === "degraded"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : "border-red-500/60 bg-red-500/15 text-red-100"
          }`}
        >
          System health: {health.status.toUpperCase()}
          {!health.ok ? " — check the items below before service." : ""}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Database"
          value={health ? (health.database.ok ? "OK" : "DOWN") : "…"}
          detail={
            health
              ? `${health.database.latencyMs} ms · server clock ${when(health.serverNow)}`
              : ""
          }
          danger={health ? !health.database.ok : false}
        />
        <Card
          title="Worker"
          value={health ? (health.worker.healthy ? "OK" : "STALE") : "…"}
          detail={health ? `last tick ${when(health.worker.lastTick)}` : ""}
          danger={health ? !health.worker.healthy : false}
        />
        <Card
          title="Disk"
          value={health?.disk ? `${health.disk.freeGb} GB free` : "unknown"}
          detail={health?.disk ? `of ${Math.round(health.disk.totalBytes / 1024 ** 3)} GB` : ""}
          danger={Boolean(health?.disk && health.disk.freeBytes < 500 * 1024 * 1024)}
        />
        <Card
          title="Last backup"
          value={health?.lastBackupAt ? when(health.lastBackupAt) : "never"}
          detail="Nightly at 03:00; keep 14 days"
          danger={!health?.lastBackupAt}
        />
        <Card
          title="Clock"
          value={
            health?.clockSkewMs === null || health?.clockSkewMs === undefined
              ? "unknown"
              : `${health.clockSkewMs} ms skew`
          }
          detail="NTP should be enabled on the mini PC"
          danger={Boolean(health?.clockSkewMs && Math.abs(health.clockSkewMs) > 5_000)}
        />
        <Card
          title="Cameras"
          value={
            health
              ? `${health.cameras.filter((camera) => camera.status === "OK").length}/${health.cameras.length} OK`
              : "…"
          }
          detail={health?.cameras.map((camera) => `${camera.name}: ${camera.status}`).join(" · ") ?? ""}
          danger={Boolean(health?.cameras.some((camera) => camera.status === "OFFLINE"))}
        />
      </div>

      <div className={`${CARD} flex flex-wrap items-center justify-between gap-2`}>
        <div className="text-xs text-slate-400">
          Node {health?.node ?? "—"} · uptime {health ? Math.round(health.uptimeS / 60) : 0} min ·{" "}
          {health?.serverNow ? when(health.serverNow) : ""}
        </div>
        <a href="/api/admin/diagnostics" className={BTN}>
          Download diagnostics
        </a>
      </div>
      <p className="text-[11px] text-slate-500">
        Diagnostics contain health, settings, audit/detection logs and the tuning CSV. No video,
        images, RTSP credentials or secrets. Host service logs: run `scripts/diagnostics.sh` on the
        mini PC.
      </p>
    </div>
  );
}

function Card({
  title,
  value,
  detail,
  danger,
}: {
  title: string;
  value: string;
  detail: string;
  danger: boolean;
}) {
  return (
    <div className={`${CARD} ${danger ? "border-red-500/50" : ""}`}>
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{title}</p>
      <p className={`mt-1 text-lg font-semibold ${danger ? "text-red-300" : "text-white"}`}>{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
    </div>
  );
}
