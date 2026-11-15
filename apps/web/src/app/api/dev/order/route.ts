import { randomUUID } from "node:crypto";
import { devConsoleEnabled, placeOrder, prisma } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ tableId: uuidSchema });

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!devConsoleEnabled()) {
      return NextResponse.json({ error: "Dev console is disabled" }, { status: 404 });
    }
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;

    const body = bodySchema.parse(await request.json());
    const table = await prisma.diningTable.findUnique({
      where: { id: body.tableId },
      select: { zoneId: true },
    });
    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const variant = await prisma.menuVariant.findFirst({
      where: {
        item: { available: true, active: true },
        prices: { some: { zoneId: table.zoneId, available: true } },
      },
      select: { id: true },
    });
    if (!variant) {
      return NextResponse.json({ error: "No available menu item for this floor" }, { status: 409 });
    }

    const result = await placeOrder({
      tableId: body.tableId,
      items: [{ variantId: variant.id, qty: 1 }],
      clientKey: randomUUID(),
      placedById: auth.user.id,
    });

    return ok({ ok: true, orderId: result.orderId, kotNumber: result.kotNumber });
  } catch (error) {
    return apiError(error);
  }
}
