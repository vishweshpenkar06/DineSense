import { requestBill } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const result = await requestBill({
      sessionId: uuidSchema.parse(id),
      actorId: auth.user.id,
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
