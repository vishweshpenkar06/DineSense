import { getSetupStatus } from "@dinesense/db";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok(await getSetupStatus());
  } catch (error) {
    return apiError(error);
  }
}
