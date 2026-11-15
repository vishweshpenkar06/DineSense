import { decryptSecret, safeEqual } from "@dinesense/core";
import { prisma } from "./client";
import { encryptionKeySource } from "./config";
import { DomainError, NotFoundError } from "./errors";
import { applyTableEventTx } from "./engine";
import { notify } from "./notify";
import { loadSettings } from "./settings";

export type VisionState = "occupied" | "empty";

export type VisionInput = {
  cameraId: string | null;
  tableId: string;
  state: VisionState;
  personCount: number;
  confidence: number;
  ts: Date;
  eventId: string;
};

export type VisionOutcome = {
  duplicate: boolean;
  applied: boolean;
  state: string | null;
};

export async function recordVisionEvent(input: VisionInput): Promise<VisionOutcome> {
  const settings = await loadSettings();

  const outcome = await prisma.$transaction(async (tx) => {
    const table = await tx.diningTable.findUnique({
      where: { id: input.tableId },
      select: { id: true, state: true, visionMutedUntil: true },
    });
    if (!table) throw new NotFoundError("table");

    const inserted = await tx.visionEvent.createMany({
      data: [
        {
          eventId: input.eventId,
          cameraId: input.cameraId,
          tableId: input.tableId,
          state: input.state,
          personCount: input.personCount,
          confidence: input.confidence,
          ts: input.ts,
        },
      ],
      skipDuplicates: true,
    });

    if (inserted.count === 0) {
      return { duplicate: true, applied: false, state: table.state } satisfies VisionOutcome;
    }

    if (table.visionMutedUntil && table.visionMutedUntil.getTime() > input.ts.getTime()) {
      return { duplicate: false, applied: false, state: table.state } satisfies VisionOutcome;
    }

    if (input.state === "occupied") {
      const applied = await applyTableEventTx(tx, {
        tableId: input.tableId,
        event: { type: "VISION_OCCUPIED", at: input.ts },
        settings,
        openedBy: "VISION",
      });
      return { duplicate: false, applied: true, state: applied.state } satisfies VisionOutcome;
    }

    const applied = await applyTableEventTx(tx, {
      tableId: input.tableId,
      event: { type: "VISION_EMPTY", at: input.ts },
      settings,
      openedBy: "VISION",
    });

    const session = await tx.session.findFirst({
      where: { tableId: input.tableId, closedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        state: true,
        emptyAt: true,
        _count: { select: { orders: true } },
      },
    });

    if (
      session &&
      session.emptyAt === null &&
      session._count.orders === 0 &&
      (session.state === "occupied" || session.state === "needs_order")
    ) {
      await tx.session.update({
        where: { id: session.id },
        data: { emptyAt: input.ts },
      });
    }

    return { duplicate: false, applied: true, state: applied.state } satisfies VisionOutcome;
  });

  if (outcome.applied) {
    await notify("table.updated", { tableId: input.tableId, state: outcome.state });
  }

  return outcome;
}

export async function setVisionMute(input: {
  tableId: string;
  mutedUntil: Date | null;
  actorId?: string | null;
}): Promise<{ tableId: string; mutedUntil: Date | null }> {
  const table = await prisma.diningTable
    .update({
      where: { id: input.tableId },
      data: { visionMutedUntil: input.mutedUntil },
      select: { id: true, visionMutedUntil: true },
    })
    .catch(() => null);
  if (!table) throw new NotFoundError("table");

  await notify("table.updated", {
    tableId: table.id,
    visionMutedUntil: table.visionMutedUntil?.toISOString() ?? null,
  });
  return { tableId: table.id, mutedUntil: table.visionMutedUntil };
}

export type CameraHeartbeat = {
  cameraId: string;
  status: "ok" | "degraded" | "offline";
  fps?: number | null;
  ts: Date;
};

export async function recordHeartbeat(input: CameraHeartbeat): Promise<void> {
  const status = input.status === "ok" ? "OK" : input.status === "degraded" ? "DEGRADED" : "OFFLINE";
  const updated = await prisma.camera
    .update({
      where: { id: input.cameraId },
      data: { status, fps: input.fps ?? null, lastHeartbeatAt: input.ts },
      select: { id: true, zoneId: true },
    })
    .catch(() => null);
  if (!updated) throw new NotFoundError("camera");
  await notify("camera.status", { cameraId: updated.id, status });
}

export type VisionConfig = {
  settings: { SEATED_CONFIRM_S: number; EMPTY_CONFIRM_S: number };
  cameras: Array<{
    id: string;
    name: string;
    rtsp_url: string;
    tables: Array<{
      id: string;
      label: string;
      polygon: number[][];
      muted_until: string | null;
    }>;
  }>;
};

export async function getVisionConfig(): Promise<VisionConfig> {
  const settings = await loadSettings();
  const cameras = await prisma.camera.findMany({
    where: { active: true },
    include: {
      tables: { where: { active: true }, orderBy: { label: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    settings: {
      SEATED_CONFIRM_S: settings.SEATED_CONFIRM_S,
      EMPTY_CONFIRM_S: settings.EMPTY_CONFIRM_S,
    },
    cameras: cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      rtsp_url: decryptSecret(camera.rtspUrlEncrypted, encryptionKeySource()),
      tables: camera.tables.map((table) => ({
        id: table.id,
        label: table.label,
        polygon: Array.isArray(table.zonePolygon) ? (table.zonePolygon as number[][]) : [],
        muted_until: table.visionMutedUntil?.toISOString() ?? null,
      })),
    })),
  };
}

export function assertVisionSecret(header: string | null, secret: string | null): void {
  if (!secret) throw new DomainError("Vision secret is not configured", 503, "vision_unavailable");
  if (!header || !safeEqual(header, `Bearer ${secret}`)) {
    throw new DomainError("Unauthorized", 401, "unauthorized");
  }
}
