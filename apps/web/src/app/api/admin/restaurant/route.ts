import { updateRestaurant } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(300),
  phone: z.string().max(40).nullable().optional(),
  gstin: z.string().max(40).nullable().optional(),
  billFooter: z.string().max(160).nullable().optional(),
});

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = bodySchema.parse(await request.json());
    await updateRestaurant({ ...body, actorId: auth.user.id });
    return ok({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
