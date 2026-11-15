import { payBill } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "UPI", "CARD"]),
        amountPaise: z.number().int().positive(),
      }),
    )
    .max(10),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const result = await payBill({
      sessionId: uuidSchema.parse(id),
      payments: body.payments,
      actorId: auth.user.id,
    });
    return ok(result);
  } catch (error) {
    return apiError(error);
  }
}
