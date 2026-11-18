"use client";

import { errorMessage, postJson } from "@/lib/client";
import { showPickupNotification } from "@/lib/notifications";
import { useSnapshotLive } from "@/lib/live";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function WaiterAlerts() {
  const { snapshot, refresh } = useSnapshotLive();
  const seen = useRef(new Set<string>());

  async function markPickedUp(sessionId: string) {
    try {
      await postJson(`/api/sessions/${sessionId}/served`);
      toast.success("Pickup confirmed");
      await refresh();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  }

  useEffect(() => {
    if (!snapshot) return;
    for (const task of snapshot.tasks) {
      if (task.type !== "food_ready" || task.status === "SNOOZED") continue;
      const key = `${task.id}:${task.lastAlertAt ?? task.createdAt}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      const where = task.tableLabel
        ? `${task.tableLabel}${task.zoneName ? ` · ${task.zoneName}` : ""}`
        : "Takeaway";
      toast.success("Food ready for pickup", {
        id: `pickup-${key}`,
        description: where,
        duration: 30_000,
        action: task.sessionId
          ? {
              label: "Picked up",
              onClick: () => void markPickedUp(task.sessionId as string),
            }
          : undefined,
      });
      void showPickupNotification(task);
    }
  }, [snapshot]);

  return null;
}
