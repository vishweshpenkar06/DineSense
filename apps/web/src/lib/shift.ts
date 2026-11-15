"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

export type Chime = "start" | "alert" | "new" | "cancel";

export function useShift() {
  const [unlocked, setUnlocked] = useState(false);
  const [screenAwake, setScreenAwake] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  const lockRef = useRef<WakeLockSentinelLike | null>(null);

  const acquireWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    try {
      lockRef.current = await nav.wakeLock.request("screen");
      setScreenAwake(true);
      lockRef.current.addEventListener("release", () => setScreenAwake(false));
    } catch {
      setScreenAwake(false);
    }
  }, []);

  const chime = useCallback((kind: Chime) => {
    const context = contextRef.current;
    if (!context) return;
    const notes =
      kind === "alert"
        ? [880, 880]
        : kind === "new"
          ? [1046, 1318]
          : kind === "cancel"
            ? [392, 262]
            : [660];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.16;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    });
  }, []);

  const vibrate = useCallback((kind: Chime) => {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    navigator.vibrate(
      kind === "alert" ? [200, 80, 200] : kind === "cancel" ? [350] : [90],
    );
  }, []);

  const start = useCallback(async () => {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      const context = contextRef.current ?? new Ctor();
      contextRef.current = context;
      await context.resume();
      setUnlocked(true);
      chime("start");
    }
    await acquireWakeLock();
  }, [acquireWakeLock, chime]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [acquireWakeLock]);

  return { unlocked, screenAwake, start, chime, vibrate };
}
