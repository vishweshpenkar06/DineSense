import { setTableStateManually } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { tableStateSchema, uuidSchema } from "@/lib/validation";

const bodySchema = z.object({ state: tableStateSchema });

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;

    const { id } = await context.params;
    const tableId = uuidSchema.parse(id);
    const body = bodySchema.parse(await request.json());

    const result = await setTableStateManually({
      tableId,
      target: body.state,
      actorId: auth.user.id,
    });
    return ok({ ok: true, state: result.state, changed: result.changed });
  } catch (error) {
    return apiError(error);
  }
}
