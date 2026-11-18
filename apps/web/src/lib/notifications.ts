"use client";

import type { SnapshotTask } from "@dinesense/core";

export type NativeBridge = {
  notifyPickup?: (title: string, body: string) => void;
  notificationPermission?: () => string;
  setKeepScreenOn?: (keep: boolean) => void;
  printPage?: () => void;
};

declare global {
  interface Window {
    DineSenseApp?: NativeBridge;
  }
}

export type NotificationState = "unsupported" | "insecure" | "default" | "granted" | "denied";

export function getNotificationState(): NotificationState {
  if (typeof window === "undefined") return "unsupported";
  // The Android shell presents native notifications; no browser permission is involved.
  if (window.DineSenseApp?.notifyPickup) {
    return window.DineSenseApp.notificationPermission?.() === "denied" ? "denied" : "granted";
  }
  if (!("Notification" in window)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationState> {
  const state = getNotificationState();
  if (state !== "default") return state;
  try {
    return await Notification.requestPermission();
  } catch {
    return getNotificationState();
  }
}

function notificationOptions(task: SnapshotTask): NotificationOptions {
  return {
    body: task.text,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `pickup-${task.id}`,
    requireInteraction: true,
    data: { url: "/waiter" },
  };
}

export async function showPickupNotification(task: SnapshotTask): Promise<void> {
  if (getNotificationState() !== "granted") return;
  if (window.DineSenseApp?.notifyPickup) {
    window.DineSenseApp.notifyPickup("Food ready for pickup", task.text);
    return;
  }
  const options = notificationOptions(task);
  try {
    const registration =
      "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (registration) {
      await registration.showNotification("Food ready for pickup", options);
      return;
    }
    new Notification("Food ready for pickup", options);
  } catch {
    try {
      new Notification("Food ready for pickup", options);
    } catch {
      // The in-app toast still tells the waiter.
    }
  }
}
