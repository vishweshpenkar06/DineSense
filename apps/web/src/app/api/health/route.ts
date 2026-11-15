import { NextResponse } from "next/server";
import { buildHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const health = await buildHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
