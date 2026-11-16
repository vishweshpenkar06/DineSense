"use client";

import { BrandMark } from "@/components/brand";
import { ConnectionBadge } from "@/components/connection-badge";
import { useSnapshotLive } from "@/lib/live";
import { ArrowLeft, Camera, VideoOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const STATUS_STYLE: Record<string, string> = {
  OK: "border-jade/25 bg-jade/[0.08] text-jade",
  OFFLINE: "border-coral/30 bg-coral/[0.08] text-coral",
  ERROR: "border-coral/30 bg-coral/[0.08] text-coral",
};

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
      <main className="mx-auto flex min-h-[100dvh] max-w-md items-center justify-center px-5">
        <Link href="/login" className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-canvas">
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[100dvh] max-w-4xl px-4 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/waiter"
            aria-label="Back to floor"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="font-display text-[1.7rem] font-medium leading-none tracking-[-0.02em]">Cameras</h1>
            <p className="mt-1 truncate text-xs text-muted">
              {cameras.length} camera{cameras.length === 1 ? "" : "s"} · {activeZone ?? "No floor"}
            </p>
          </div>
        </div>
        <ConnectionBadge status={stream} />
      </header>

      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {zones.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setZone(name)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              name === activeZone
                ? "bg-accent text-canvas"
                : "border border-line bg-surface text-muted hover:text-ink"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {cameras.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-faint">
            <VideoOff className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-medium">No cameras configured</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
            Ask the owner to add a camera in Admin → Cameras. You can still update tables manually.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {cameras.map((camera) => (
            <section key={camera.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-muted" />
                  <span className="text-sm font-medium">{camera.name}</span>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium capitalize ${
                    STATUS_STYLE[camera.status] ?? "border-accent/25 bg-accent/[0.08] text-accent"
                  }`}
                >
                  {camera.status.toLowerCase()}
                  {camera.fps ? ` · ${camera.fps.toFixed(1)} fps` : ""}
                </span>
              </div>
              <div className="border-y border-line bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/camera/${camera.id}/snapshot.jpg?t=${tick}`}
                  alt={`${camera.name} live view`}
                  className="aspect-video w-full object-contain"
                />
              </div>
              {camera.status === "OFFLINE" ? (
                <p className="flex items-start gap-2 bg-accent/[0.06] px-4 py-2.5 text-xs text-accent">
                  <VideoOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Camera offline — set tables manually until it reconnects.
                </p>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 text-[11px] text-faint">
                  <BrandMark className="h-3 w-3" /> Vision is watching this floor
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
