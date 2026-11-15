import {
  createCategory,
  createItem,
  createVariant,
  deleteCategory,
  deleteItem,
  deleteVariant,
  getAdminMenu,
  updateCategory,
  updateItem,
  updateVariant,
} from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("category"),
    name: z.string().min(1).max(80),
    sort: z.number().int().optional(),
  }),
  z.object({
    entity: z.literal("item"),
    categoryId: uuidSchema,
    name: z.string().min(1).max(120),
    nameLocal: z.string().max(120).nullable().optional(),
    isVeg: z.boolean().optional(),
    needsKitchen: z.boolean().optional(),
    available: z.boolean().optional(),
    sort: z.number().int().optional(),
  }),
  z.object({
    entity: z.literal("variant"),
    itemId: uuidSchema,
    label: z.string().min(1).max(60),
  }),
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("category"),
    id: uuidSchema,
    name: z.string().min(1).max(80).optional(),
    sort: z.number().int().optional(),
  }),
  z.object({
    entity: z.literal("item"),
    id: uuidSchema,
    name: z.string().min(1).max(120).optional(),
    nameLocal: z.string().max(120).nullable().optional(),
    isVeg: z.boolean().optional(),
    needsKitchen: z.boolean().optional(),
    available: z.boolean().optional(),
    active: z.boolean().optional(),
    sort: z.number().int().optional(),
  }),
  z.object({
    entity: z.literal("variant"),
    id: uuidSchema,
    label: z.string().min(1).max(60).optional(),
  }),
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("category"), id: uuidSchema }),
  z.object({ entity: z.literal("item"), id: uuidSchema }),
  z.object({ entity: z.literal("variant"), id: uuidSchema }),
]);

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok(await getAdminMenu());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = createSchema.parse(await request.json());
    if (body.entity === "category") {
      return ok(await createCategory({ ...body, actorId: auth.user.id }), 201);
    }
    if (body.entity === "item") {
      return ok(await createItem({ ...body, actorId: auth.user.id }), 201);
    }
    return ok(await createVariant({ ...body, actorId: auth.user.id }), 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = updateSchema.parse(await request.json());
    if (body.entity === "category") {
      await updateCategory({ ...body, actorId: auth.user.id });
    } else if (body.entity === "item") {
      await updateItem({ ...body, actorId: auth.user.id });
    } else {
      await updateVariant({ ...body, actorId: auth.user.id });
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
    if (body.entity === "category") {
      await deleteCategory({ ...body, actorId: auth.user.id });
    } else if (body.entity === "item") {
      await deleteItem({ ...body, actorId: auth.user.id });
    } else {
      await deleteVariant({ ...body, actorId: auth.user.id });
    }
    return ok({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
