import { assertVisionSecret, getVisionConfig, visionSharedSecret } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    assertVisionSecret(request.headers.get("authorization"), visionSharedSecret());
    const config = await getVisionConfig();
    return NextResponse.json(config, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
