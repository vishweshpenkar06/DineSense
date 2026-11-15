import {
  getAdminCameras,
  getAdminSettings,
  getAdminStaff,
  getRecentDetections,
  prisma,
} from "@dinesense/db";
import { strToU8, zipSync } from "fflate";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { buildHealth } from "@/lib/health";
import { fetchTuning } from "@/lib/vision";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse | Response> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;

    const [health, settings, staff, cameras, audit, visionEvents, tuning] = await Promise.all([
      buildHealth(),
      getAdminSettings(),
      getAdminStaff(),
      getAdminCameras(),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { actor: { select: { name: true, role: true } } },
      }),
      getRecentDetections({ limit: 200 }),
      fetchTuning(200).catch(() => null),
    ]);

    const readme = [
      "DineSense diagnostics bundle",
      "",
      "Contains: health, settings, restaurant profile, staff (no hashes), cameras",
      "(no RTSP URLs), the last 200 audit rows, the last 200 vision events and the",
      "vision tuning rows. It contains no video, no images and no secrets.",
      "",
      "Host logs are available with scripts/diagnostics.sh on the mini PC.",
    ].join("\n");

    const files: Record<string, Uint8Array> = {
      "README.txt": strToU8(readme),
      "health.json": strToU8(JSON.stringify(health, null, 2)),
      "settings.json": strToU8(JSON.stringify(settings, null, 2)),
      "staff.json": strToU8(JSON.stringify(staff, null, 2)),
      "cameras.json": strToU8(JSON.stringify(cameras, null, 2)),
      "audit-log.json": strToU8(JSON.stringify(audit, null, 2)),
      "vision-events.json": strToU8(JSON.stringify(visionEvents, null, 2)),
      "tuning.json": strToU8(JSON.stringify(tuning, null, 2)),
    };
    const zip = zipSync(files);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="dinesense-diagnostics-${stamp}.zip"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
