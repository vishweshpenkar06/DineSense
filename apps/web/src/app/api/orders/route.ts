import { placeOrder } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { orderSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;

    const body = orderSchema.parse(await request.json());
    const result = await placeOrder({
      tableId: body.tableId,
      sessionId: body.sessionId,
      clientKey: body.clientKey,
      note: body.note ?? null,
      placedById: auth.user.id,
      items: body.items,
    });

    return ok(
      {
        ok: true,
        orderId: result.orderId,
        kotNumber: result.kotNumber,
        sessionId: result.sessionId,
        duplicate: result.duplicate,
      },
      result.duplicate ? 200 : 201,
    );
  } catch (error) {
    return apiError(error);
  }
}
