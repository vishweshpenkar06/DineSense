import {
  businessDateRange,
  businessDateString,
  type PilotOverrideDto,
  type PilotReviewDto,
  type PilotTableRowDto,
} from "@dinesense/core";
import { prisma } from "./client";
import { DomainError } from "./errors";
import { loadSettings } from "./settings";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function noteKey(date: string): string {
  return `PILOT_NOTE_${date}`;
}

export async function getPilotReview(input: { date?: string | null } = {}): Promise<PilotReviewDto> {
  const settings = await loadSettings();
  const today = businessDateString(new Date(), settings.BUSINESS_DAY_START);
  const date = input.date ?? today;
  if (!DATE_RE.test(date)) throw new DomainError("Use a YYYY-MM-DD date");
  if (date > today) throw new DomainError("The review date cannot be in the future");
  let range;
  try {
    range = businessDateRange(date, date, settings.BUSINESS_DAY_START);
  } catch (error) {
    throw new DomainError(error instanceof Error ? error.message : "Invalid date");
  }

  const [audits, events, abandonedVisits, needsOrderAlerts, note] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        action: "table.manual_set",
        createdAt: { gte: range.startUtc, lt: range.endUtc },
      },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { name: true } } },
    }),
    prisma.visionEvent.findMany({
      where: { ts: { gte: range.startUtc, lt: range.endUtc } },
      select: { tableId: true, state: true },
    }),
    prisma.session.count({
      where: {
        closeReason: "ABANDONED",
        closedAt: { gte: range.startUtc, lt: range.endUtc },
      },
    }),
    prisma.task.count({
      where: {
        type: "needs_order",
        createdAt: { gte: range.startUtc, lt: range.endUtc },
      },
    }),
    prisma.setting.findUnique({ where: { key: noteKey(date) } }),
  ]);

  const eventCounts = new Map<string, { occupied: number; empty: number }>();
  for (const event of events) {
    if (!event.tableId) continue;
    const row = eventCounts.get(event.tableId) ?? { occupied: 0, empty: 0 };
    if (event.state === "occupied") row.occupied += 1;
    else if (event.state === "empty") row.empty += 1;
    eventCounts.set(event.tableId, row);
  }

  const tableIds = new Set<string>();
  for (const event of events) if (event.tableId) tableIds.add(event.tableId);
  for (const audit of audits) tableIds.add(audit.entityId);
  const tables = await prisma.diningTable.findMany({
    where: { id: { in: [...tableIds] } },
    include: { zone: { select: { name: true } } },
  });
  const tableById = new Map(tables.map((table) => [table.id, table]));

  const overrides: PilotOverrideDto[] = [];
  for (const audit of audits) {
    const detail = (audit.detail ?? {}) as { from?: string; to?: string };
    const table = tableById.get(audit.entityId);
    const lastVision = table
      ? await prisma.visionEvent.findFirst({
          where: { tableId: table.id, ts: { lte: audit.createdAt } },
          orderBy: { ts: "desc" },
          select: { state: true },
        })
      : null;
    const fromState = detail.from ?? "unknown";
    const toState = detail.to ?? "unknown";
    const visionState = lastVision?.state ?? null;
    const mismatch =
      (visionState === "empty" && toState === "occupied") ||
      (visionState === "occupied" && (toState === "free" || toState === "needs_cleaning"));
    overrides.push({
      id: audit.id,
      tableId: audit.entityId,
      tableLabel: table?.label ?? null,
      zoneName: table?.zone.name ?? null,
      actorName: audit.actor?.name ?? "Manual/system",
      at: audit.createdAt.toISOString(),
      fromState,
      toState,
      visionState,
      mismatch,
    });
  }

  const tableRows: PilotTableRowDto[] = [...tableIds]
    .map((tableId) => {
      const table = tableById.get(tableId);
      const counts = eventCounts.get(tableId) ?? { occupied: 0, empty: 0 };
      const rows = overrides.filter((override) => override.tableId === tableId);
      return {
        tableId,
        label: table?.label ?? "Unknown",
        zoneName: table?.zone.name ?? "—",
        occupiedEvents: counts.occupied,
        emptyEvents: counts.empty,
        overrides: rows.length,
        mismatches: rows.filter((row) => row.mismatch).length,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    date,
    from: range.from,
    to: range.to,
    shadowMode: settings.SHADOW_MODE,
    summary: {
      overrides: overrides.length,
      tablesTouched: new Set(overrides.map((override) => override.tableId)).size,
      mismatches: overrides.filter((override) => override.mismatch).length,
      cameraEvents: events.length,
      abandonedVisits,
      needsOrderAlerts,
    },
    tables: tableRows,
    overrides,
    notes: typeof note?.value === "string" ? note.value : "",
  };
}

export async function savePilotNotes(input: {
  date: string;
  note: string;
  actorId?: string | null;
}): Promise<void> {
  const settings = await loadSettings();
  const today = businessDateString(new Date(), settings.BUSINESS_DAY_START);
  if (!DATE_RE.test(input.date)) throw new DomainError("Use a YYYY-MM-DD date");
  if (input.date > today) throw new DomainError("The review date cannot be in the future");
  const note = input.note.trim();
  if (note.length > 4000) throw new DomainError("Keep the note under 4000 characters");

  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: noteKey(input.date) },
      create: { key: noteKey(input.date), value: note },
      update: { value: note },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: "pilot.notes_saved",
        entity: "setting",
        entityId: noteKey(input.date),
        detail: { length: note.length },
      },
    });
  });
}
