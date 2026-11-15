import { shouldAbandon, type Settings } from "@dinesense/core";
import { prisma } from "./client";
import { applyTableEvent } from "./engine";
import { notify } from "./notify";
import { loadSettings, writeInternalSetting } from "./settings";

export async function processDueTimers(now = new Date()): Promise<number> {
  const settings = await loadSettings();
  const due = await prisma.session.findMany({
    where: {
      closedAt: null,
      state: "occupied",
      decisionDeadline: { lte: now },
      orders: { none: {} },
      tableId: { not: null },
    },
    select: { tableId: true },
  });

  let fired = 0;
  for (const session of due) {
    if (!session.tableId) continue;
    const result = await applyTableEvent({
      tableId: session.tableId,
      event: { type: "TIMER_EXPIRED", at: now },
      settings,
      openedBy: "VISION",
    });
    if (result.changed) fired += 1;
  }
  return fired;
}

export async function abandonSession(
  sessionId: string,
  now: Date,
  settings: Settings,
): Promise<string | null> {
  const abandoned = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { orders: true } } },
    });
    if (!session || session.closedAt || !session.tableId) return null;
    if (
      !shouldAbandon(
        {
          state: session.state,
          hasOrders: session._count.orders > 0,
          emptyAt: session.emptyAt,
        },
        now,
        settings,
      )
    ) {
      return null;
    }

    await tx.session.update({
      where: { id: sessionId },
      data: { closedAt: now, closeReason: "ABANDONED" },
    });
    await tx.diningTable.update({
      where: { id: session.tableId },
      data: { state: "free" },
    });
    await tx.task.updateMany({
      where: { sessionId, status: { in: ["OPEN", "ACK", "SNOOZED"] } },
      data: { status: "CANCELLED" },
    });
    await tx.auditLog.create({
      data: {
        action: "session.abandoned",
        entity: "session",
        entityId: sessionId,
        detail: { tableId: session.tableId },
      },
    });

    return session.tableId;
  });

  if (abandoned) {
    await notify("table.updated", { tableId: abandoned, state: "free" });
    await notify("task.updated", { tableId: abandoned, reason: "abandoned" });
  }
  return abandoned;
}

export async function processAbandoned(now = new Date()): Promise<number> {
  const settings = await loadSettings();
  const cutoff = new Date(now.getTime() - settings.EMPTY_CONFIRM_S * 1000);
  const candidates = await prisma.session.findMany({
    where: {
      closedAt: null,
      state: { in: ["occupied", "needs_order"] },
      emptyAt: { not: null, lte: cutoff },
      orders: { none: {} },
      tableId: { not: null },
    },
    select: { id: true },
  });

  let closed = 0;
  for (const candidate of candidates) {
    const tableId = await abandonSession(candidate.id, now, settings);
    if (tableId) closed += 1;
  }
  return closed;
}

export type TaskAlertResult = { escalated: number; realerted: number; woken: number };

export async function processTaskAlerts(now = new Date()): Promise<TaskAlertResult> {
  const settings = await loadSettings();

  const escalated = await prisma.task.updateMany({
    where: {
      status: { in: ["OPEN", "ACK"] },
      escalatedAt: null,
      createdAt: { lte: new Date(now.getTime() - settings.ALERT_ESCALATE_S * 1000) },
    },
    data: { escalatedAt: now },
  });

  const realerted = await prisma.task.updateMany({
    where: {
      status: "OPEN",
      lastAlertAt: { lte: new Date(now.getTime() - settings.REALERT_S * 1000) },
    },
    data: { lastAlertAt: now },
  });

  const woken = await prisma.task.updateMany({
    where: { status: "SNOOZED", snoozedUntil: { lte: now } },
    data: { status: "OPEN", lastAlertAt: now, snoozedUntil: null },
  });

  if (escalated.count > 0 || woken.count > 0) {
    await notify("task.updated", { escalated: escalated.count, woken: woken.count });
  } else if (realerted.count > 0) {
    await notify("task.updated", { realerted: realerted.count });
  }

  return { escalated: escalated.count, realerted: realerted.count, woken: woken.count };
}

export const CAMERA_OFFLINE_AFTER_MS = 30_000;

export async function processCameraHealth(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CAMERA_OFFLINE_AFTER_MS);
  const stale = await prisma.camera.updateMany({
    where: {
      status: { not: "OFFLINE" },
      OR: [
        { lastHeartbeatAt: { lt: cutoff } },
        { lastHeartbeatAt: null, createdAt: { lt: cutoff } },
      ],
    },
    data: { status: "OFFLINE" },
  });
  if (stale.count > 0) {
    await notify("camera.status", { offline: stale.count });
  }
  return stale.count;
}

export async function workerTick(now = new Date()): Promise<void> {
  await processDueTimers(now);
  await processAbandoned(now);
  await processTaskAlerts(now);
  await processCameraHealth(now);
  await writeInternalSetting("_worker_last_tick", { at: now.toISOString() });
}
