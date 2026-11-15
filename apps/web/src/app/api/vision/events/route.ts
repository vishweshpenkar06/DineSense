import { assertVisionSecret, recordVisionEvent, visionSharedSecret } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { visionEventSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertVisionSecret(request.headers.get("authorization"), visionSharedSecret());
    const body = visionEventSchema.parse(await request.json());

    const outcome = await recordVisionEvent({
      cameraId: body.camera_id ?? null,
      tableId: body.table_id,
      state: body.state,
      personCount: body.person_count,
      confidence: body.confidence,
      ts: new Date(body.ts),
      eventId: body.event_id,
    });

    return ok({ ok: true, ...outcome });
  } catch (error) {
    return apiError(error);
  }
}
