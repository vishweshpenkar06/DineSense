import { buildSnapshot } from "@dinesense/db";
import { apiError, ok } from "@/lib/api";
import { ALL_ROLES, requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(ALL_ROLES);
    if ("error" in auth) return auth.error;
    const snapshot = await buildSnapshot(auth.user);
    return ok({ serverNow: snapshot.serverNow, tables: snapshot.tables });
  } catch (error) {
    return apiError(error);
  }
}
