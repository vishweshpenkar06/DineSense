import { devConsoleEnabled, prisma } from "@dinesense/db";
import { NextResponse } from "next/server";
import { apiError, ok, parseLimit } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    if (!devConsoleEnabled()) {
      return NextResponse.json({ error: "Dev console is disabled" }, { status: 404 });
    }
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"), 40, 200);

    const events = await prisma.visionEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { table: { select: { label: true } } },
    });

    return ok({
      events: events.map((event) => ({
        id: event.id,
        eventId: event.eventId,
        tableId: event.tableId,
        tableLabel: event.table?.label ?? null,
        state: event.state,
        personCount: event.personCount,
        confidence: event.confidence,
        ts: event.ts.toISOString(),
        receivedAt: event.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
