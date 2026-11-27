import type { TuningResponseDto } from "@dinesense/core";

const base = (process.env.VISION_URL ?? "http://vision:8100").replace(/\/$/, "");
const secret = process.env.VISION_SHARED_SECRET ?? "";

export type CameraTestResult = {
  ok: boolean;
  width?: number;
  height?: number;
  fps?: number | null;
  error?: string;
};

export async function visionFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${secret}`,
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function testCameraStream(url: string): Promise<CameraTestResult> {
  try {
    const response = await visionFetch(
      "/test",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rtsp_url: url }),
      },
      10_000,
    );
    if (!response.ok) {
      return { ok: false, error: `Vision service returned ${response.status}` };
    }
    return (await response.json()) as CameraTestResult;
  } catch {
    return { ok: false, error: "Vision service is not reachable" };
  }
}

export async function refreshVision(): Promise<boolean> {
  try {
    const response = await visionFetch("/config/refresh", { method: "POST" }, 3000);
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchTuning(tail: number): Promise<TuningResponseDto> {
  const response = await visionFetch(`/tuning?tail=${tail}`, {}, 25_000);
  if (!response.ok) throw new Error(`Tuning log returned ${response.status}`);
  return (await response.json()) as TuningResponseDto;
}
