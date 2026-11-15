import {
  createTable,
  createZone,
  deleteTable,
  deleteZone,
  getAdminFloors,
  updateTable,
  updateZone,
} from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const zoneFields = {
  isAc: z.boolean().optional(),
  surchargeType: z.enum(["NONE", "FLAT", "PERCENT"]).optional(),
  surchargeValue: z.number().int().min(0).optional(),
  sort: z.number().int().optional(),
};

const createSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("zone"), name: z.string().min(1).max(80), ...zoneFields }),
  z.object({
    entity: z.literal("table"),
    zoneId: uuidSchema,
    label: z.string().min(1).max(20),
    seats: z.number().int().min(1).max(50).optional(),
    cameraId: uuidSchema.nullable().optional(),
  }),
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("zone"), id: uuidSchema, name: z.string().min(1).max(80).optional(), ...zoneFields }),
  z.object({
    entity: z.literal("table"),
    id: uuidSchema,
    label: z.string().min(1).max(20).optional(),
    seats: z.number().int().min(1).max(50).optional(),
    cameraId: uuidSchema.nullable().optional(),
    active: z.boolean().optional(),
  }),
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("zone"), id: uuidSchema }),
  z.object({ entity: z.literal("table"), id: uuidSchema }),
]);

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok(await getAdminFloors());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = createSchema.parse(await request.json());
    if (body.entity === "zone") {
      return ok(await createZone({ ...body, actorId: auth.user.id }), 201);
    }
    return ok(await createTable({ ...body, actorId: auth.user.id }), 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = updateSchema.parse(await request.json());
    if (body.entity === "zone") {
      await updateZone({ ...body, actorId: auth.user.id });
    } else {
      await updateTable({ ...body, actorId: auth.user.id });
    }
    return ok({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = deleteSchema.parse(await request.json());
    if (body.entity === "zone") {
      await deleteZone({ ...body, actorId: auth.user.id });
      return ok({ ok: true });
    }
    return ok(await deleteTable({ ...body, actorId: auth.user.id }));
  } catch (error) {
    return apiError(error);
  }
}
