import {
  sortTasks,
  type Snapshot,
  type SnapshotCamera,
  type SnapshotOrder,
  type SnapshotTable,
  type SnapshotTask,
  type StaffRole,
} from "@dinesense/core";
import { prisma } from "./client";
import { loadSettings, workerLastTick } from "./settings";

export async function buildSnapshot(me: {
  id: string;
  name: string;
  role: StaffRole;
}): Promise<Snapshot> {
  const [settings, tables, tasks, orders, cameras, lastTick] = await Promise.all([
    loadSettings(),
    prisma.diningTable.findMany({
      where: { active: true },
      include: {
        zone: { select: { id: true, name: true, isAc: true } },
        sessions: {
          where: { closedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            occupiedAt: true,
            decisionDeadline: true,
            firstOrderAt: true,
            emptyAt: true,
          },
        },
      },
      orderBy: [{ zone: { sort: "asc" } }, { label: "asc" }],
    }),
    prisma.task.findMany({
      where: { status: { in: ["OPEN", "ACK", "SNOOZED"] } },
      include: {
        table: { select: { label: true } },
        zone: { select: { name: true } },
      },
    }),
    prisma.order.findMany({
      where: { status: { in: ["PLACED", "PREPARING", "READY"] } },
      include: {
        items: true,
        session: { select: { tableId: true, table: { select: { label: true, zone: { select: { name: true } } } } } },
      },
      orderBy: { placedAt: "asc" },
    }),
    prisma.camera.findMany({
      include: { zone: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    workerLastTick(),
  ]);

  const tableDtos: SnapshotTable[] = tables.map((table) => {
    const session = table.sessions[0] ?? null;
    return {
      id: table.id,
      label: table.label,
      seats: table.seats,
      state: table.state,
      zone: table.zone,
      cameraId: table.cameraId,
      visionMutedUntil: table.visionMutedUntil?.toISOString() ?? null,
      session: session
        ? {
            id: session.id,
            occupiedAt: session.occupiedAt.toISOString(),
            decisionDeadline: session.decisionDeadline?.toISOString() ?? null,
            firstOrderAt: session.firstOrderAt?.toISOString() ?? null,
            emptyAt: session.emptyAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  const taskDtos: SnapshotTask[] = sortTasks(tasks, null).map((task) => ({
    id: task.id,
    type: task.type,
    status: task.status,
    priority: task.priority,
    text: task.text,
    tableId: task.tableId,
    tableLabel: task.table?.label ?? null,
    zoneId: task.zoneId,
    zoneName: task.zone?.name ?? null,
    sessionId: task.sessionId,
    createdAt: task.createdAt.toISOString(),
    ackAt: task.ackAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    lastAlertAt: task.lastAlertAt.toISOString(),
    escalatedAt: task.escalatedAt?.toISOString() ?? null,
  }));

  const orderDtos: SnapshotOrder[] = orders.map((order) => ({
    id: order.id,
    kotNumber: order.kotNumber,
    status: order.status,
    tableId: order.session.tableId,
    tableLabel: order.session.table?.label ?? null,
    zoneName: order.session.table?.zone.name ?? null,
    placedAt: order.placedAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.nameSnapshot,
      variant: item.variantSnapshot,
      qty: item.qty,
      unitPricePaise: item.unitPricePaise,
      note: item.note,
      cancelled: item.cancelled,
    })),
  }));

  const cameraDtos: SnapshotCamera[] = cameras.map((camera) => ({
    id: camera.id,
    name: camera.name,
    zoneName: camera.zone.name,
    status: camera.status,
    lastHeartbeatAt: camera.lastHeartbeatAt?.toISOString() ?? null,
    fps: camera.fps,
  }));

  const workerHealthy = Boolean(
    lastTick && Date.now() - lastTick.getTime() < 15_000,
  );

  return {
    serverNow: new Date().toISOString(),
    me,
    settings: {
      DECIDE_WINDOW_S: settings.DECIDE_WINDOW_S,
      SEATED_CONFIRM_S: settings.SEATED_CONFIRM_S,
      EMPTY_CONFIRM_S: settings.EMPTY_CONFIRM_S,
      SNOOZE_S: settings.SNOOZE_S,
      REALERT_S: settings.REALERT_S,
      ALERT_ESCALATE_S: settings.ALERT_ESCALATE_S,
      VISION_MUTE_S: settings.VISION_MUTE_S,
      TICKET_AMBER_S: settings.TICKET_AMBER_S,
      TICKET_RED_S: settings.TICKET_RED_S,
      BUSINESS_DAY_START: settings.BUSINESS_DAY_START,
    },
    tables: tableDtos,
    tasks: taskDtos,
    orders: orderDtos,
    cameras: cameraDtos,
    worker: { lastTick: lastTick?.toISOString() ?? null, healthy: workerHealthy },
  };
}
