import { devConsoleEnabled, notify, prisma } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ seconds: z.number().int().min(1).max(3600) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!devConsoleEnabled()) {
      return NextResponse.json({ error: "Dev console is disabled" }, { status: 404 });
    }
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;

    const body = bodySchema.parse(await request.json());
    const shiftMs = body.seconds * 1000;

    const sessions = await prisma.session.findMany({
      where: { closedAt: null, decisionDeadline: { not: null } },
      select: { id: true, decisionDeadline: true },
    });
    for (const session of sessions) {
      if (!session.decisionDeadline) continue;
      await prisma.session.update({
        where: { id: session.id },
        data: {
          decisionDeadline: new Date(session.decisionDeadline.getTime() - shiftMs),
        },
      });
    }

    const emptySessions = await prisma.session.findMany({
      where: { closedAt: null, emptyAt: { not: null } },
      select: { id: true, emptyAt: true },
    });
    for (const session of emptySessions) {
      if (!session.emptyAt) continue;
      await prisma.session.update({
        where: { id: session.id },
        data: { emptyAt: new Date(session.emptyAt.getTime() - shiftMs) },
      });
    }

    const tasks = await prisma.task.findMany({
      where: { status: { in: ["OPEN", "ACK", "SNOOZED"] } },
      select: { id: true, createdAt: true, lastAlertAt: true, snoozedUntil: true },
    });
    for (const task of tasks) {
      await prisma.task.update({
        where: { id: task.id },
        data: {
          createdAt: new Date(task.createdAt.getTime() - shiftMs),
          lastAlertAt: new Date(task.lastAlertAt.getTime() - shiftMs),
          snoozedUntil: task.snoozedUntil
            ? new Date(task.snoozedUntil.getTime() - shiftMs)
            : null,
        },
      });
    }

    await notify("table.updated", { reason: "time-skip", seconds: body.seconds });
    await notify("task.updated", { reason: "time-skip", seconds: body.seconds });

    return ok({
      ok: true,
      shiftedDeadlines: sessions.length,
      shiftedEmpty: emptySessions.length,
      shiftedTasks: tasks.length,
      seconds: body.seconds,
    });
  } catch (error) {
    return apiError(error);
  }
}
