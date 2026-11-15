"use client";

import type { Snapshot } from "@dinesense/core";
import { useCallback, useEffect, useState } from "react";

const STREAM_EVENTS = [
  "table.updated",
  "task.created",
  "task.updated",
  "order.created",
  "order.updated",
  "menu.availability",
  "camera.status",
  "bill.updated",
] as const;

export type StreamStatus = "connecting" | "live" | "reconnecting";

export function useSnapshotLive() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [stream, setStream] = useState<StreamStatus>("connecting");
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/snapshot", { cache: "no-store" });
      if (response.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!response.ok) throw new Error(`Snapshot failed (${response.status})`);
      const data = (await response.json()) as Snapshot;
      setSnapshot(data);
      setUnauthorized(false);
      setOffset(new Date(data.serverNow).getTime() - Date.now());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load data");
    }
  }, []);

  useEffect(() => {
    void refresh();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 150);
    };

    const source = new EventSource("/api/stream");
    source.addEventListener("open", () => {
      setStream("live");
      void refresh();
    });
    source.addEventListener("hello", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { serverNow: string };
        setOffset(new Date(data.serverNow).getTime() - Date.now());
      } catch {
        // ignore
      }
      setStream("live");
    });
    const onEvent = () => scheduleRefresh();
    for (const name of STREAM_EVENTS) source.addEventListener(name, onEvent);
    source.onerror = () => setStream("reconnecting");

    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => {
      source.close();
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    if (stream !== "reconnecting" || unauthorized) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [stream, unauthorized, refresh]);

  return {
    snapshot,
    stream,
    unauthorized,
    error,
    refresh,
    serverNowMs: now + offset,
    setError,
  };
}
