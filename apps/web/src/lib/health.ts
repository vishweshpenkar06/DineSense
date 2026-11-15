import { statfs, readFile } from "node:fs/promises";
import { prisma, workerLastTick } from "@dinesense/db";

export type HealthSnapshot = {
  ok: boolean;
  status: "ok" | "degraded" | "down";
  serverNow: string;
  database: {
    ok: boolean;
    latencyMs: number;
    now: string | null;
    error: string | null;
  };
  worker: { lastTick: string | null; healthy: boolean };
  disk: { freeBytes: number; totalBytes: number; freeGb: number } | null;
  lastBackupAt: string | null;
  clockSkewMs: number | null;
  cameras: Array<{
    id: string;
    name: string;
    zoneName: string;
    status: string;
    fps: number | null;
    lastHeartbeatAt: string | null;
  }>;
  node: string;
  uptimeS: number;
};

export async function buildHealth(): Promise<HealthSnapshot> {
  const started = Date.now();
  let databaseOk = true;
  let databaseError: string | null = null;
  let databaseNow: Date | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    const rows = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
    databaseNow = rows[0]?.now ?? null;
  } catch (error) {
    databaseOk = false;
    databaseError = error instanceof Error ? error.message : "database unreachable";
  }
  const latencyMs = Date.now() - started;

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

  let disk: HealthSnapshot["disk"] = null;
  try {
    const stats = await statfs("/");
    const freeBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    disk = {
      freeBytes,
      totalBytes,
      freeGb: Math.round((freeBytes / 1024 ** 3) * 10) / 10,
    };
  } catch {
    disk = null;
  }

  const lastBackupAt = await readFile(
    process.env.BACKUP_STATUS_FILE ?? "/backups/.last_backup",
    "utf8",
  )
    .then((value) => value.trim() || null)
    .catch(() => null);

  const serverNow = new Date();
  const clockSkewMs = databaseNow ? databaseNow.getTime() - serverNow.getTime() : null;
  const diskCritical = disk ? disk.freeBytes < 500 * 1024 * 1024 : false;
  const diskWarning = disk ? disk.freeBytes < 2 * 1024 ** 3 : false;
  const ok = databaseOk && workerHealthy && !diskCritical;
  const degraded =
    ok &&
    (diskWarning ||
      (clockSkewMs !== null && Math.abs(clockSkewMs) > 5_000) ||
      cameras.some((camera) => camera.status === "OFFLINE"));

  return {
    ok,
    status: !ok ? "down" : degraded ? "degraded" : "ok",
    serverNow: serverNow.toISOString(),
    database: {
      ok: databaseOk,
      latencyMs,
      now: databaseNow?.toISOString() ?? null,
      error: databaseError,
    },
    worker: { lastTick: lastTick?.toISOString() ?? null, healthy: workerHealthy },
    disk,
    lastBackupAt,
    clockSkewMs,
    cameras: cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      zoneName: camera.zone.name,
      status: camera.status,
      fps: camera.fps,
      lastHeartbeatAt: camera.lastHeartbeatAt?.toISOString() ?? null,
    })),
    node: process.version,
    uptimeS: Math.round(process.uptime()),
  };
}
