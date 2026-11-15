import { getAdminSettings, updateAdminSettings } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ settings: z.record(z.unknown()) });

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok(await getAdminSettings());
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = bodySchema.parse(await request.json());
    const settings = await updateAdminSettings({
      settings: body.settings,
      actorId: auth.user.id,
    });
    return ok({ settings });
  } catch (error) {
    return apiError(error);
  }
}
