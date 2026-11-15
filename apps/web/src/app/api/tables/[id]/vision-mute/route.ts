import { loadSettings, setVisionMute } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  seconds: z.number().int().min(0).max(3600).optional(),
  muted: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;

    const { id } = await context.params;
    const tableId = uuidSchema.parse(id);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const settings = await loadSettings();
    const seconds = body.seconds ?? settings.VISION_MUTE_S;
    const mutedUntil =
      body.muted === false || seconds === 0 ? null : new Date(Date.now() + seconds * 1000);

    const result = await setVisionMute({ tableId, mutedUntil, actorId: auth.user.id });
    return ok({
      ok: true,
      tableId: result.tableId,
      mutedUntil: result.mutedUntil?.toISOString() ?? null,
    });
  } catch (error) {
    return apiError(error);
  }
}
