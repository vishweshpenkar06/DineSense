import { getCameraCalibration, setTableZone } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";
import { refreshVision } from "@/lib/vision";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tableId: uuidSchema,
  polygon: z.array(z.array(z.number()).length(2)).min(3).max(100),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    return ok(await getCameraCalibration(uuidSchema.parse(id)));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const cameraId = uuidSchema.parse(id);
    const body = bodySchema.parse(await request.json());
    await setTableZone({
      tableId: body.tableId,
      cameraId,
      polygon: body.polygon,
      actorId: auth.user.id,
    });
    await refreshVision();
    return ok(await getCameraCalibration(cameraId));
  } catch (error) {
    return apiError(error);
  }
}
