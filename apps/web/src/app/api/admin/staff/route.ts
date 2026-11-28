import { createStaff, getAdminStaff, updateStaff } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const roleSchema = z.enum(["ADMIN", "RECEPTIONIST", "WAITER", "CHEF"]);

const createSchema = z.object({
  name: z.string().min(1).max(80),
  role: roleSchema,
  pin: z.string().regex(/^\d{6}$/).optional(),
  password: z.string().min(10).max(200).optional(),
});

const updateSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(80).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
  password: z.string().min(10).max(200).optional(),
});

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok({ staff: await getAdminStaff() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = createSchema.parse(await request.json());
    return ok(await createStaff({ ...body, actorId: auth.user.id }), 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = updateSchema.parse(await request.json());
    await updateStaff({ ...body, actorId: auth.user.id });
    return ok({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
