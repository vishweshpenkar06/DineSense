import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok, parseLimit } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { fetchTuning } from "@/lib/vision";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const url = new URL(request.url);
    const tail = parseLimit(url.searchParams.get("tail"), 60, 500);
    return ok(await fetchTuning(tail));
  } catch (error) {
    return apiError(error);
  }
}
