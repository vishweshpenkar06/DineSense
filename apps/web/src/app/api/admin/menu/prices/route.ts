import { setVariantPrices } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  variantId: uuidSchema,
  prices: z
    .array(
      z.object({
        zoneId: uuidSchema,
        pricePaise: z.number().int().min(0),
        available: z.boolean(),
      }),
    )
    .min(1),
});

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = bodySchema.parse(await request.json());
    await setVariantPrices({ ...body, actorId: auth.user.id });
    return ok({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
