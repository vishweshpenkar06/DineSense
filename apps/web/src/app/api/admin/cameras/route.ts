import { createCamera, deleteCamera, getAdminCameras, updateCamera } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";
import { refreshVision } from "@/lib/vision";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  zoneId: uuidSchema,
  rtspUrl: z.string().min(1).max(500),
});

const updateSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(80).optional(),
  zoneId: uuidSchema.optional(),
  rtspUrl: z.string().min(1).max(500).optional(),
  active: z.boolean().optional(),
});

const deleteSchema = z.object({ id: uuidSchema });

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok({ cameras: await getAdminCameras() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = createSchema.parse(await request.json());
    const created = await createCamera({ ...body, actorId: auth.user.id });
    await refreshVision();
    return ok(created, 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = updateSchema.parse(await request.json());
    await updateCamera({ ...body, actorId: auth.user.id });
    await refreshVision();
    return ok({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = deleteSchema.parse(await request.json());
    const result = await deleteCamera({ id: body.id, actorId: auth.user.id });
    await refreshVision();
    return ok(result);
  } catch (error) {
    return apiError(error);
  }
}
