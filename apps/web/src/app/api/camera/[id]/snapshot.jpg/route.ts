import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER", "CHEF"]);
    if ("error" in auth) return auth.error;

    const { id } = await context.params;
    const cameraId = uuidSchema.parse(id);
    const visionUrl = (process.env.VISION_URL ?? "http://vision:8100").replace(/\/$/, "");
    const secret = process.env.VISION_SHARED_SECRET ?? "";

    const upstream = await fetch(`${visionUrl}/snapshot/${encodeURIComponent(cameraId)}.jpg`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
      headers: { authorization: `Bearer ${secret}` },
    }).catch(() => null);

    if (!upstream || !upstream.ok) {
      return NextResponse.json(
        { error: "Camera snapshot unavailable" },
        { status: upstream?.status === 404 ? 404 : 502 },
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
