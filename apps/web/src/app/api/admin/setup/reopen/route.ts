import { getSetupStatus, reopenSetup } from "@dinesense/db";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    await reopenSetup(auth.user.id);
    return ok({ ok: true, status: await getSetupStatus() });
  } catch (error) {
    return apiError(error);
  }
}
