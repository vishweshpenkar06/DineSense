import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ALL_ROLES, requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const auth = await requireRole(ALL_ROLES);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ user: auth.user });
}
