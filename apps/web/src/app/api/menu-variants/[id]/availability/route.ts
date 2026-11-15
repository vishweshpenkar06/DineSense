import { setVariantAvailability } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ available: z.boolean() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "CHEF"]);
    if ("error" in auth) return auth.error;

    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const result = await setVariantAvailability({
      variantId: uuidSchema.parse(id),
      available: body.available,
      actorId: auth.user.id,
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
