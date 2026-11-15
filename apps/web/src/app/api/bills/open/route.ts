import { getOpenBills } from "@dinesense/db";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST"]);
    if ("error" in auth) return auth.error;
    return ok({ sessions: await getOpenBills() });
  } catch (error) {
    return apiError(error);
  }
}
