import { readSessionUser } from "@/lib/auth";
import { buildHealth } from "@/lib/health";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const health = await buildHealth();
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ ok: health.ok, status: health.ok ? "ok" : "degraded" }, {
      status: health.ok ? 200 : 503,
    });
  }
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
