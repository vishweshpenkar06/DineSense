import { moveSession } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ tableId: uuidSchema });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const result = await moveSession({
      sessionId: uuidSchema.parse(id),
      targetTableId: body.tableId,
      actorId: auth.user.id,
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
