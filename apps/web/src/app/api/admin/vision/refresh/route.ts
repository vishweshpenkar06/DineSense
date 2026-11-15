import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { refreshVision } from "@/lib/vision";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok({ ok: await refreshVision() });
  } catch (error) {
    return apiError(error);
  }
}
