import { createTakeawaySession } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.literal("TAKEAWAY"),
  zoneId: uuidSchema.optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;
    const body = bodySchema.parse(await request.json());
    const result = await createTakeawaySession({
      zoneId: body.zoneId,
      actorId: auth.user.id,
    });
    return ok({ ok: true, ...result }, 201);
  } catch (error) {
    return apiError(error);
  }
}
