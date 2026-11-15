import { readyOrder } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "CHEF"]);
    if ("error" in auth) return auth.error;
    const { id } = await context.params;
    const result = await readyOrder(uuidSchema.parse(id), { id: auth.user.id, role: auth.user.role });
    return ok({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
