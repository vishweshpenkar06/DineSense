import {
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
import { NotFoundError } from "./errors";
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
    await tx.diningTable.update({
      where: { id: table.id },
      data: { state: result.state as DbTableState },
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

export async function applyTableEvent(input: ApplyInput): Promise<ApplyResult> {
  const result = await prisma.$transaction((tx) => applyTableEventTx(tx, input));
  await emitApplied(result);
  return result;
}

export async function setTableStateManually(input: {
  tableId: string;
  target: TableState;
  actorId?: string | null;
  at?: Date;
}): Promise<ApplyResult> {
  const { loadSettings } = await import("./settings");
  const settings = await loadSettings();
  return applyTableEvent({
    tableId: input.tableId,
    event: { type: "MANUAL_SET", at: input.at ?? new Date(), target: input.target },
    settings,
    actorId: input.actorId ?? null,
    openedBy: "MANUAL",
  });
}
