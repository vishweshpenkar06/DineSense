import { assertVisionSecret, recordHeartbeat, visionSharedSecret } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { heartbeatSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertVisionSecret(request.headers.get("authorization"), visionSharedSecret());
    const body = heartbeatSchema.parse(await request.json());

    await recordHeartbeat({
      cameraId: body.camera_id,
      status: body.status,
      fps: body.fps ?? null,
      ts: new Date(body.ts),
    });

    return ok({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
