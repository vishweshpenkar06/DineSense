"use client";

import { ConnectionBadge } from "@/components/connection-badge";
import { useSnapshotLive } from "@/lib/live";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function CamerasPage() {
  const { snapshot, stream, unauthorized } = useSnapshotLive();
  const [zone, setZone] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const zones = useMemo(() => {
    if (!snapshot) return [];
    return [...new Set(snapshot.cameras.map((camera) => camera.zoneName))];
  }, [snapshot]);

  const activeZone = zone ?? zones[0] ?? null;
  const cameras = snapshot?.cameras.filter((camera) => camera.zoneName === activeZone) ?? [];

  if (unauthorized) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-5">
        <Link href="/login" className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-slate-950">
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <Link href="/waiter" className="text-xs text-slate-400">
            ← Floor
          </Link>
          <h1 className="text-2xl font-semibold">Cameras</h1>
        </div>
        <ConnectionBadge status={stream} />
      </header>

      <div className="flex gap-2 overflow-x-auto">
        {zones.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setZone(name)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
              name === activeZone
                ? "bg-emerald-500 text-slate-950"
                : "border border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {cameras.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
          No cameras configured for this floor.
        </p>
      ) : (
        cameras.map((camera) => (
          <section key={camera.id} className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">{camera.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 ${
                  camera.status === "OK"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : camera.status === "OFFLINE"
                      ? "bg-red-500/15 text-red-300"
                      : "bg-amber-500/15 text-amber-200"
                }`}
              >
                {camera.status.toLowerCase()}
                {camera.fps ? ` · ${camera.fps.toFixed(1)} fps` : ""}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/camera/${camera.id}/snapshot.jpg?t=${tick}`}
                alt={`${camera.name} live view`}
                className="aspect-video w-full object-contain"
              />
            </div>
            {camera.status === "OFFLINE" ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Camera offline — set tables manually until it reconnects.
              </p>
            ) : null}
          </section>
        ))
      )}
    </main>
  );
}
