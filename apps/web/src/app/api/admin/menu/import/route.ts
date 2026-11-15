import { importMenuGroups } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const priceSchema = z.object({
  groundPaise: z.number().int().min(0).nullable(),
  firstPaise: z.number().int().min(0).nullable(),
});

const bodySchema = z.object({
  groups: z
    .array(
      z.object({
        category: z.string().min(1).max(80),
        item: z.string().min(1).max(120),
        localName: z.string().max(120).nullable(),
        isVeg: z.boolean(),
        needsKitchen: z.boolean(),
        variants: z
          .array(z.object({ label: z.string().min(1).max(60), prices: priceSchema }))
          .min(1),
      }),
    )
    .min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = bodySchema.parse(await request.json());
    const result = await importMenuGroups({ ...body, actorId: auth.user.id });
    return ok({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
