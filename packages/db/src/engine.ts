import {
  deriveServiceState,
  taskText,
  transition,
  type Effect,
  type Settings,
  type TableContext,
  type TableEvent,
  type TableState,
  type TaskType,
} from "@dinesense/core";
import { Prisma } from "@prisma/client";
import type { TableState as DbTableState, TaskStatus as DbTaskStatus } from "@prisma/client";
import { prisma } from "./client";
import { ConflictError, NotFoundError } from "./errors";
import { notify } from "./notify";

const OPEN_TASK_STATUSES: DbTaskStatus[] = ["OPEN", "ACK", "SNOOZED"];

export type ApplyInput = {
  tableId: string;
  event: TableEvent;
  settings: Settings;
  actorId?: string | null;
  openedBy?: "VISION" | "MANUAL";
};

export type ApplyResult = {
  tableId: string;
  sessionId: string | null;
  state: TableState;
  changed: boolean;
  effects: Effect[];
  createdTaskIds: string[];
  tasksChanged: boolean;
};

function taskScope(sessionId: string | null, tableId: string): Prisma.TaskWhereInput {
  return sessionId ? { sessionId } : { tableId };
}

export async function applyTableEventTx(
  tx: Prisma.TransactionClient,
  input: ApplyInput,
): Promise<ApplyResult> {
  await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id = ${input.tableId} FOR UPDATE`;
  const table = await tx.diningTable.findUnique({
    where: { id: input.tableId },
    include: { zone: true },
  });
  if (!table) throw new NotFoundError("table");

  const session = await tx.session.findFirst({
    where: { tableId: table.id, closedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true } } },
  });

  const unpaidBills = session
    ? await tx.bill.count({ where: { sessionId: session.id, status: "OPEN" } })
    : 0;

  const ctx: TableContext = {
    state: table.state,
    hasOpenSession: Boolean(session),
    hasOrders: (session?._count.orders ?? 0) > 0,
    hasUnpaidBill: unpaidBills > 0,
    isFirstOrder: session ? session.firstOrderAt === null : false,
    cleanedAt: table.cleanedAt,
  };

  const result = transition(ctx, input.event, input.settings);

  let sessionId: string | null = session?.id ?? null;
  const createdTaskIds: string[] = [];
  let tasksChanged = false;
  const openedBy = input.openedBy ?? "MANUAL";

  for (const effect of result.effects) {
    switch (effect.kind) {
      case "openSession": {
        if (sessionId) {
          await tx.session.update({
            where: { id: sessionId },
            data: {
              state: result.state as DbTableState,
              occupiedAt: input.event.at,
              decisionDeadline: effect.deadlineAt,
              closedAt: null,
              closeReason: null,
            },
          });
        } else {
          const created = await tx.session.create({
            data: {
              kind: "DINE_IN",
              tableId: table.id,
              state: result.state,
              openedBy,
              occupiedAt: input.event.at,
              decisionDeadline: effect.deadlineAt,
            },
          });
          sessionId = created.id;
        }
        break;
      }

      case "closeSession": {
        if (sessionId) {
          await tx.session.update({
            where: { id: sessionId },
            data: { closedAt: effect.at, closeReason: effect.reason },
          });
        }
        break;
      }

      case "createTask": {
        const existing = await tx.task.findFirst({
          where: {
            type: effect.taskType as TaskType,
            status: { in: OPEN_TASK_STATUSES },
            ...taskScope(sessionId, table.id),
          },
          select: { id: true },
        });
        if (!existing) {
          const created = await tx.task.create({
            data: {
              type: effect.taskType,
              priority: effect.priority,
              tableId: table.id,
              zoneId: table.zoneId,
              sessionId,
              text: taskText(effect.taskType, {
                tableLabel: table.label,
                zoneName: table.zone.name,
              }),
            },
          });
          createdTaskIds.push(created.id);
          tasksChanged = true;
        }
        break;
      }

      case "cancelTasks": {
        const updated = await tx.task.updateMany({
          where: {
            type: effect.taskType,
            status: { in: OPEN_TASK_STATUSES },
            ...taskScope(sessionId, table.id),
          },
          data: { status: "CANCELLED" },
        });
        if (updated.count > 0) tasksChanged = true;
        break;
      }

      case "completeTasks": {
        const updated = await tx.task.updateMany({
          where: {
            type: effect.taskType,
            status: { in: OPEN_TASK_STATUSES },
            ...taskScope(sessionId, table.id),
          },
          data: { status: "DONE", doneAt: input.event.at },
        });
        if (updated.count > 0) tasksChanged = true;
        break;
      }

      case "cancelOpenTasks": {
        const updated = await tx.task.updateMany({
          where: {
            status: { in: OPEN_TASK_STATUSES },
            ...taskScope(sessionId, table.id),
          },
          data: { status: "CANCELLED" },
        });
        if (updated.count > 0) tasksChanged = true;
        break;
      }

      case "setFirstOrderAt": {
        if (sessionId) {
          await tx.session.update({
            where: { id: sessionId },
            data: { firstOrderAt: effect.at },
          });
        }
        break;
      }

      case "audit": {
        await tx.auditLog.create({
          data: {
            actorId: input.actorId ?? null,
            action: effect.action,
            entity: "table",
            entityId: table.id,
            detail: (effect.detail ?? {}) as Prisma.InputJsonValue,
          },
        });
        break;
      }
    }
  }

  if (result.changed) {
    const wasCleaned =
      table.state === "needs_cleaning" &&
      (input.event.type === "CLEANED" ||
        (input.event.type === "MANUAL_SET" && result.state === "free"));
    await tx.diningTable.update({
      where: { id: table.id },
      data: {
        state: result.state as DbTableState,
        cleanedAt: wasCleaned ? input.event.at : undefined,
      },
    });
    if (sessionId) {
      await tx.session.update({
        where: { id: sessionId },
        data: { state: result.state as DbTableState },
      });
    }
  }

  if (sessionId && (input.event.type === "VISION_OCCUPIED" || input.event.type === "ORDER_PLACED")) {
    await tx.session.update({ where: { id: sessionId }, data: { emptyAt: null } });
  }

  return {
    tableId: table.id,
    sessionId,
    state: result.state,
    changed: result.changed,
    effects: result.effects,
    createdTaskIds,
    tasksChanged,
  };
}

export async function emitApplied(result: ApplyResult): Promise<void> {
  await notify("table.updated", { tableId: result.tableId, state: result.state });
  if (result.createdTaskIds.length > 0) {
    await notify("task.created", { tableId: result.tableId, taskIds: result.createdTaskIds });
  } else if (result.tasksChanged) {
    await notify("task.updated", { tableId: result.tableId });
  }
}

export async function reconcileServiceTx(
  tx: Prisma.TransactionClient,
  sessionId: string,
  settings: Settings,
  at: Date = new Date(),
): Promise<void> {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: { id: true, tableId: true, closedAt: true },
  });
  if (!session || session.closedAt || !session.tableId) return;

  const orders = await tx.order.findMany({
    where: { sessionId },
    select: { status: true },
  });
  const billRequested =
    (await tx.task.count({
      where: { sessionId, type: "bill_requested", status: { in: [...OPEN_TASK_STATUSES] } },
    })) > 0;
  const state = deriveServiceState(orders as Array<{ status: "PLACED" | "PREPARING" | "READY" | "SERVED" | "CANCELLED" }>, billRequested);

  await tx.diningTable.update({ where: { id: session.tableId }, data: { state } });
  await tx.session.update({ where: { id: sessionId }, data: { state } });

  const anyReady = orders.some((order) => order.status === "READY");
  const openReadyTasks = await tx.task.findMany({
    where: { sessionId, type: "food_ready", status: { in: [...OPEN_TASK_STATUSES] } },
    select: { id: true },
  });
  if (!anyReady) {
    if (openReadyTasks.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: openReadyTasks.map((task) => task.id) } },
        data: { status: "DONE", doneAt: at },
      });
    }
    const live = orders.some(
      (order) => order.status === "PLACED" || order.status === "PREPARING",
    );
    if (!live) {
      await tx.session.update({
        where: { id: sessionId },
        data: { decisionDeadline: new Date(at.getTime() + settings.DECIDE_WINDOW_S * 1000) },
      });
    }
  } else if (openReadyTasks.length === 0) {
    const task = await tx.task.create({
      data: {
        type: "food_ready",
        priority: 1,
        sessionId,
        text: "Food ready for pickup",
      },
    });
    await notify("task.created", { taskIds: [task.id], sessionId });
  }
}

export async function applyTableEvent(input: ApplyInput): Promise<ApplyResult> {
  try {
    const result = await prisma.$transaction((tx) => applyTableEventTx(tx, input));
    await emitApplied(result);
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("Another event changed this table first");
    }
    throw error;
  }
}

export async function setTableStateManually(input: {
  tableId: string;
  target: TableState;
  actorId?: string | null;
  at?: Date;
}): Promise<ApplyResult> {
  const { loadSettings } = await import("./settings");
  const settings = await loadSettings();
  const result = await applyTableEvent({
    tableId: input.tableId,
    event: { type: "MANUAL_SET", at: input.at ?? new Date(), target: input.target },
    settings,
    actorId: input.actorId ?? null,
    openedBy: "MANUAL",
  });
  if (
    result.effects.some(
      (effect) => effect.kind === "audit" && effect.action === "table.manual_set_refused",
    )
  ) {
    throw new ConflictError("Cannot close a visit with unpaid food or an unpaid bill. Pay or void it first.");
  }
  return result;
}
