import { randomUUID } from "node:crypto";
import { devConsoleEnabled, prisma, recordVisionEvent } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tableId: uuidSchema,
  state: z.enum(["occupied", "empty"]),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!devConsoleEnabled()) {
      return NextResponse.json({ error: "Dev console is disabled" }, { status: 404 });
    }
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;

    const body = bodySchema.parse(await request.json());
    const table = await prisma.diningTable.findUnique({
      where: { id: body.tableId },
      select: { id: true, cameraId: true },
    });
    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const ts = new Date();
    const outcome = await recordVisionEvent({
      cameraId: table.cameraId,
      tableId: table.id,
      state: body.state,
      personCount: body.state === "occupied" ? 2 : 0,
      confidence: 0.9,
      ts,
      eventId: randomUUID(),
    });

    return ok({ ok: true, ...outcome, simulatedAt: ts.toISOString() });
  } catch (error) {
    return apiError(error);
  }
}
