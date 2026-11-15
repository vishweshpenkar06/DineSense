import { devConsoleEnabled, resetRuntimeData } from "@dinesense/db";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    if (!devConsoleEnabled()) {
      return NextResponse.json({ error: "Dev console is disabled" }, { status: 404 });
    }
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok({ ok: true, counts: await resetRuntimeData() });
  } catch (error) {
    return apiError(error);
  }
}
