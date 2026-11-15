import { cancelOrderItem } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().max(200).optional() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await cancelOrderItem({
      itemId: uuidSchema.parse(id),
      reason: body.reason,
      actor: { id: auth.user.id, role: auth.user.role },
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
