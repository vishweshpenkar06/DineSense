import { getMenuForZone, prisma } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER", "CHEF"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const tableId = url.searchParams.get("tableId");
    let zoneId = url.searchParams.get("zoneId");

    if (tableId) {
      const table = await prisma.diningTable.findUnique({
        where: { id: uuidSchema.parse(tableId) },
        select: { zoneId: true },
      });
      if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
      zoneId = table.zoneId;
    }
    if (!zoneId) {
      return NextResponse.json({ error: "tableId or zoneId is required" }, { status: 400 });
    }

    const menu = await getMenuForZone(uuidSchema.parse(zoneId));
    return ok(menu);
  } catch (error) {
    return apiError(error);
  }
}
