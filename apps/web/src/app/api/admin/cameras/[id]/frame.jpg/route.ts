import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";
import { visionFetch } from "@/lib/vision";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const cameraId = uuidSchema.parse(id);
    const upstream = await visionFetch(`/frame/${encodeURIComponent(cameraId)}.jpg`, {}, 5000).catch(
      () => null,
    );
    if (!upstream || !upstream.ok) {
      return NextResponse.json(
        { error: "No raw frame yet. Start the camera in the vision service." },
        { status: upstream?.status === 404 ? 404 : 502 },
      );
    }
    return new Response(upstream.body, {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
