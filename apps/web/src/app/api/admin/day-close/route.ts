import { getDayClose, saveDayClose } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  businessDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  countedCashPaise: z.number().int().min(0),
  note: z.string().max(500).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    return ok(await getDayClose(request.nextUrl.searchParams.get("date")));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;
    const body = bodySchema.parse(await request.json());
    return ok(
      await saveDayClose({
        businessDay: body.businessDay,
        countedCashPaise: body.countedCashPaise,
        note: body.note,
        actorId: auth.user.id,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
