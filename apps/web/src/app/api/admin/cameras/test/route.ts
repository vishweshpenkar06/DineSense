import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { testCameraStream } from "@/lib/vision";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ rtspUrl: z.string().min(1).max(500) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = bodySchema.parse(await request.json());
    return ok(await testCameraStream(body.rtspUrl));
  } catch (error) {
    return apiError(error);
  }
}
