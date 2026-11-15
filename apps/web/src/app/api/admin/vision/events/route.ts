import { getRecentDetections } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok, parseLimit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const url = new URL(request.url);
    const cameraId = url.searchParams.get("cameraId");
    const tableId = url.searchParams.get("tableId");
    const limit = parseLimit(url.searchParams.get("limit"), 40, 200);
    return ok({
      events: await getRecentDetections({
        cameraId: cameraId ? uuidSchema.parse(cameraId) : undefined,
        tableId: tableId ? uuidSchema.parse(tableId) : undefined,
        limit,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
