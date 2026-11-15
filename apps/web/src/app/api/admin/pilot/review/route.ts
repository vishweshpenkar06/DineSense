import { getPilotReview } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const date = new URL(request.url).searchParams.get("date");
    return ok(await getPilotReview({ date }));
  } catch (error) {
    return apiError(error);
  }
}
