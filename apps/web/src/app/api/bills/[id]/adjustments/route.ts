import { addBillAdjustment, removeBillAdjustment } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const addSchema = z
  .object({
    kind: z.enum(["EXTRA", "DISCOUNT"]),
    label: z.string().max(80).optional(),
    amountPaise: z.number().int().positive().optional(),
    percent: z.number().positive().max(100).optional(),
  })
  .refine((body) => body.amountPaise !== undefined || body.percent !== undefined, {
    message: "Provide an amount or a percent",
  });

const removeSchema = z.object({ adjustmentId: uuidSchema });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const body = addSchema.parse(await request.json());
    const bill = await addBillAdjustment({
      sessionId: uuidSchema.parse(id),
      kind: body.kind,
      label: body.label,
      amountPaise: body.amountPaise,
      percent: body.percent,
      actorId: auth.user.id,
    });
    return ok(bill);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const body = removeSchema.parse(await request.json());
    const bill = await removeBillAdjustment({
      sessionId: uuidSchema.parse(id),
      adjustmentId: body.adjustmentId,
      actorId: auth.user.id,
    });
    return ok(bill);
  } catch (error) {
    return apiError(error);
  }
}
