import { snoozeUntil, type Settings } from "@dinesense/core";
import { ConflictError, loadSettings, notify, prisma } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { taskActionSchema, uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;

    const { id } = await context.params;
    const taskId = uuidSchema.parse(id);
    const body = taskActionSchema.parse(await request.json());

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true, tableId: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (task.status === "DONE" || task.status === "CANCELLED") {
      throw new ConflictError(`Task is already ${task.status.toLowerCase()}`);
    }

    const now = new Date();
    let status: "ACK" | "SNOOZED" | "DONE";
    let data: {
      status: "ACK" | "SNOOZED" | "DONE";
      ackAt?: Date;
      snoozedUntil?: Date;
      doneAt?: Date;
    };

    if (body.action === "ack") {
      status = "ACK";
      data = { status, ackAt: now };
    } else if (body.action === "snooze") {
      const settings: Settings = await loadSettings();
      status = "SNOOZED";
      data = { status, ackAt: now, snoozedUntil: snoozeUntil(now, settings) };
    } else {
      status = "DONE";
      data = { status, doneAt: now };
    }

    await prisma.task.update({ where: { id: taskId }, data });
    await notify("task.updated", { taskId, tableId: task.tableId, status, action: body.action });

    return ok({ ok: true, status, taskId });
  } catch (error) {
    return apiError(error);
  }
}
