import { getReportSummary } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const url = new URL(request.url);
    const preset = url.searchParams.get("preset");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (preset && !["today", "yesterday", "last7", "month"].includes(preset)) {
      return NextResponse.json({ error: "Unknown preset" }, { status: 400 });
    }
    return ok(
      await getReportSummary({
        preset: preset as "today" | "yesterday" | "last7" | "month" | null,
        from,
        to,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
