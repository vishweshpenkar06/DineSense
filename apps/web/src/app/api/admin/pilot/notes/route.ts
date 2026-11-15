import { savePilotNotes } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(4000),
});

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = bodySchema.parse(await request.json());
    await savePilotNotes({ ...body, actorId: auth.user.id });
    return ok({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
