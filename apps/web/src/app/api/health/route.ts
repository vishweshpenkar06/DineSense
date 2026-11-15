import { prisma, workerLastTick } from "@dinesense/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  let databaseOk = true;
  let databaseError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    databaseOk = false;
    databaseError = error instanceof Error ? error.message : "database unreachable";
  }

  const databaseMs = Date.now() - startedAt;

  const [lastTick, cameras] = await Promise.all([
    databaseOk ? workerLastTick() : Promise.resolve(null),
    databaseOk
      ? prisma.camera.findMany({
          select: {
            id: true,
            name: true,
            status: true,
            fps: true,
            lastHeartbeatAt: true,
            zone: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const workerHealthy = Boolean(lastTick && Date.now() - lastTick.getTime() < 15_000);
  const healthy = databaseOk && workerHealthy;

  return NextResponse.json(
    {
      ok: healthy,
      serverNow: new Date().toISOString(),
      database: { ok: databaseOk, latencyMs: databaseMs, error: databaseError },
      worker: { lastTick: lastTick?.toISOString() ?? null, healthy: workerHealthy },
      cameras: cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        zoneName: camera.zone.name,
        status: camera.status,
        fps: camera.fps,
        lastHeartbeatAt: camera.lastHeartbeatAt?.toISOString() ?? null,
      })),
    },
    { status: healthy ? 200 : 503 },
  );
}
