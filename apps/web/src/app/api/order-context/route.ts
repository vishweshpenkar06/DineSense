import { buildOrderContext } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { uuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN", "RECEPTIONIST", "WAITER"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const tableId = url.searchParams.get("tableId");
    const sessionId = url.searchParams.get("sessionId");
    if ((!tableId && !sessionId) || (tableId && sessionId)) {
      return NextResponse.json(
        { error: "Provide exactly one of tableId or sessionId" },
        { status: 400 },
      );
    }

    const context = await buildOrderContext({
      tableId: tableId ? uuidSchema.parse(tableId) : undefined,
      sessionId: sessionId ? uuidSchema.parse(sessionId) : undefined,
    });
    return ok(context);
  } catch (error) {
    return apiError(error);
  }
}
