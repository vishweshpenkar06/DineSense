import { buildSnapshot } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api";
import { ALL_ROLES, requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const auth = await requireRole(ALL_ROLES);
    if ("error" in auth) return auth.error;
    const snapshot = await buildSnapshot(auth.user);
    return ok(snapshot);
  } catch (error) {
    return apiError(error);
  }
}
