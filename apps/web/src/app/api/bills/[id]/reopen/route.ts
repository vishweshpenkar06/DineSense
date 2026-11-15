import { reopenBill } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().min(3).max(300) });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const bill = await reopenBill({
      sessionId: uuidSchema.parse(id),
      reason: body.reason,
      actorId: auth.user.id,
    });
    return ok(bill);
  } catch (error) {
    return apiError(error);
  }
}
