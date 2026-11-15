"use client";

import type {
  AdminCameraDto,
  CameraCalibrationDto,
  TuningResponseDto,
  VisionDetectionDto,
} from "@dinesense/core";
import { apiFetch, errorMessage, getJson, postJson } from "@/lib/client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BTN, BTN_PRIMARY, CARD, INPUT, type Run } from "./ui";

type ZoneOption = { id: string; name: string; isAc: boolean };
type TestResult = { ok: boolean; width?: number; height?: number; fps?: number | null; error?: string };

function istTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
}

export function CamerasPanel({
  cameras,
  zones,
  busy,
  run,
  onChanged,
}: {
  cameras: AdminCameraDto[];
  zones: ZoneOption[];
  busy: boolean;
  run: Run;
  onChanged: () => Promise<void>;
}) {
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<CameraCalibrationDto | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [points, setPoints] = useState<number[][]>([]);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [frameTick, setFrameTick] = useState(0);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detections, setDetections] = useState<VisionDetectionDto[]>([]);
  const [tuning, setTuning] = useState<TuningResponseDto | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const loadCalibration = useCallback(async (cameraId: string) => {
    try {
      const data = await getJson<CameraCalibrationDto>(
        `/api/admin/cameras/${cameraId}/calibration`,
      );
      setCalibration(data);
      setSelectedTable((current) => {
        if (current && data.tables.some((table) => table.id === current)) return current;
        return data.tables[0]?.id ?? null;
      });
    } catch (caught) {
      setPanelError(errorMessage(caught));
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const [events, tuningData] = await Promise.all([
        getJson<{ events: VisionDetectionDto[] }>("/api/admin/vision/events?limit=30"),
        getJson<TuningResponseDto>("/api/admin/vision/tuning?tail=60"),
      ]);
      setDetections(events.events);
      setTuning(tuningData);
    } catch (caught) {
      setPanelError(errorMessage(caught));
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!selectedTable) setPoints([]);
  }, [selectedTable]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSize) return;
    canvas.width = imageSize.w;
    canvas.height = imageSize.h;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);

    for (const table of calibration?.tables ?? []) {
      if (!table.polygon || table.polygon.length < 3) continue;
      context.beginPath();
      table.polygon.forEach(([x, y], index) => {
        const px = x * canvas.width;
        const py = y * canvas.height;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.closePath();
      context.lineWidth = 2;
      context.strokeStyle = table.id === selectedTable ? "#34d399" : "#94a3b8";
      context.fillStyle = table.id === selectedTable ? "rgba(52,211,153,0.12)" : "rgba(148,163,184,0.06)";
      context.fill();
      context.stroke();
      const [cx, cy] = table.polygon.reduce(
        (acc, point) => [acc[0] + point[0] / table.polygon!.length, acc[1] + point[1] / table.polygon!.length],
        [0, 0],
      );
      context.fillStyle = "#e2e8f0";
      context.font = "16px sans-serif";
      context.fillText(table.label, cx * canvas.width, cy * canvas.height);
    }

    if (points.length > 0) {
      context.beginPath();
      points.forEach(([x, y], index) => {
        const px = x * canvas.width;
        const py = y * canvas.height;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.strokeStyle = "#fbbf24";
      context.lineWidth = 2;
      context.stroke();
      for (const [x, y] of points) {
        context.beginPath();
        context.arc(x * canvas.width, y * canvas.height, 5, 0, Math.PI * 2);
        context.fillStyle = "#fbbf24";
        context.fill();
      }
    }
  }, [calibration, imageSize, points, selectedTable]);

  useEffect(() => {
    draw();
  }, [draw]);

  async function selectCamera(cameraId: string) {
    setSelectedCamera(cameraId);
    setCalibration(null);
    setSelectedTable(null);
    setPoints([]);
    setImageSize(null);
    setFrameError(null);
    setFrameTick((value) => value + 1);
    await loadCalibration(cameraId);
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await postJson<TestResult>("/api/admin/cameras/test", { rtspUrl: testUrl }));
    } catch (caught) {
      setTestResult({ ok: false, error: errorMessage(caught) });
    } finally {
      setTesting(false);
    }
  }

  async function addCamera(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await postJson("/api/admin/cameras", {
        name: String(form.get("name") ?? ""),
        zoneId: String(form.get("zoneId") ?? ""),
        rtspUrl: String(form.get("rtspUrl") ?? ""),
      });
      await onChanged();
    }, "Camera added. Calibrate it below.");
    event.currentTarget.reset();
    setTestUrl("");
    setTestResult(null);
  }

  async function savePolygon() {
    if (!selectedCamera || !selectedTable || points.length < 3) return;
    await run(async () => {
      const updated = await apiFetch<CameraCalibrationDto>(
        `/api/admin/cameras/${selectedCamera}/calibration`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tableId: selectedTable, polygon: points }),
        },
      );
      setCalibration(updated);
      setPoints([]);
      setNotice("Zone saved. The vision service is refreshing.");
      await onChanged();
    });
  }

  async function toggleMute(tableId: string, muted: boolean) {
    await run(async () => {
      await postJson(`/api/tables/${tableId}/vision-mute`, { seconds: muted ? 0 : 300 });
      await postJson("/api/admin/vision/refresh", {});
      if (selectedCamera) await loadCalibration(selectedCamera);
    });
  }

  const selected = calibration?.tables.find((table) => table.id === selectedTable) ?? null;

  return (
    <div className="space-y-4">
      <form className={CARD} onSubmit={(event) => void addCamera(event)}>
        <h2 className="text-sm font-semibold text-slate-300">Add a camera</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input name="name" placeholder="Camera name" className={INPUT} required />
          <select name="zoneId" className={INPUT} defaultValue={zones[0]?.id ?? ""} required>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name} ({zone.isAc ? "AC" : "Non-AC"})
              </option>
            ))}
          </select>
          <input
            name="rtspUrl"
            placeholder="rtsp://user:pass@camera/stream"
            className={INPUT}
            onChange={(event) => setTestUrl(event.target.value)}
            required
          />
          <button type="submit" className={BTN} disabled={busy || zones.length === 0}>
            Add camera
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={BTN}
            disabled={!testUrl || testing}
            onClick={() => void testConnection()}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          {testResult ? (
            <span className={`text-xs ${testResult.ok ? "text-emerald-300" : "text-red-300"}`}>
              {testResult.ok
                ? `OK · ${testResult.width}×${testResult.height}${testResult.fps ? ` · ${testResult.fps} fps` : ""}`
                : testResult.error}
            </span>
          ) : null}
          <span className="text-[11px] text-slate-500">
            Credentials are encrypted at rest and never sent back to a browser.
          </span>
        </div>
      </form>

      {panelError ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {panelError}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cameras.map((camera) => (
          <div key={camera.id} className={`${CARD} space-y-2`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{camera.name}</p>
                <p className="text-xs text-slate-400">
                  {camera.zoneName} · {camera.tableCount} tables
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  !camera.active
                    ? "bg-slate-700 text-slate-300"
                    : camera.status === "OK"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : camera.status === "OFFLINE"
                        ? "bg-red-500/15 text-red-300"
                        : "bg-amber-500/15 text-amber-200"
                }`}
              >
                {camera.active ? camera.status.toLowerCase() : "disabled"}
                {camera.fps ? ` · ${camera.fps.toFixed(1)} fps` : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={BTN} disabled={busy} onClick={() => void selectCamera(camera.id)}>
                Calibrate
              </button>
              <button
                type="button"
                className={BTN}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await apiFetch("/api/admin/cameras", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ id: camera.id, active: !camera.active }),
                    });
                    await onChanged();
                  })
                }
              >
                {camera.active ? "Disable" : "Enable"}
              </button>
            </div>
            {camera.lastHeartbeatAt ? (
              <p className="text-[10px] text-slate-500">
                heartbeat {istTime(camera.lastHeartbeatAt)}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {selectedCamera && calibration ? (
        <section className={`${CARD} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-300">
                Calibrate {calibration.camera.name}
              </h2>
              <p className="text-xs text-slate-400">
                Select a table, then click each corner of the table + chairs on the image. Draw at
                least 3 points, then Save. Repeat for every table on this floor.
              </p>
            </div>
            <button
              type="button"
              className={BTN}
              onClick={() => {
                setFrameError(null);
                setFrameTick((value) => value + 1);
              }}
            >
              Refresh frame
            </button>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-black">
            {frameError ? (
              <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-amber-200">
                {frameError}
              </div>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/cameras/${selectedCamera}/frame.jpg?t=${frameTick}`}
                  alt="Camera frame for calibration"
                  className="block w-full"
                  onLoad={(event) =>
                    setImageSize({
                      w: event.currentTarget.naturalWidth,
                      h: event.currentTarget.naturalHeight,
                    })
                  }
                  onError={() =>
                    setFrameError(
                      "No raw frame yet. Check the camera is online, then press Refresh frame (the vision service may need a few seconds after saving).",
                    )
                  }
                />
                <canvas
                  ref={canvasRef}
                  onClick={(event) => {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    const x = (event.clientX - rect.left) / rect.width;
                    const y = (event.clientY - rect.top) / rect.height;
                    if (x < 0 || x > 1 || y < 0 || y > 1) return;
                    setPoints((current) => [
                      ...current,
                      [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000],
                    ]);
                  }}
                  className="absolute inset-0 h-full w-full cursor-crosshair"
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={BTN}
              disabled={points.length === 0}
              onClick={() => setPoints((current) => current.slice(0, -1))}
            >
              Undo point
            </button>
            <button type="button" className={BTN} disabled={points.length === 0} onClick={() => setPoints([])}>
              Clear
            </button>
            <button
              type="button"
              className={BTN}
              disabled={!selected?.polygon}
              onClick={() => selected?.polygon && setPoints(selected.polygon)}
            >
              Load saved points
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy || points.length < 3 || !selectedTable}
              onClick={() => void savePolygon()}
            >
              Save zone for {selected?.label ?? "table"}
            </button>
            <span className="self-center text-xs text-slate-400">{points.length} points</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {calibration.tables.map((table) => {
              const muted =
                table.visionMutedUntil !== null &&
                new Date(table.visionMutedUntil).getTime() > Date.now();
              return (
                <div
                  key={table.id}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${
                    table.id === selectedTable
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-950"
                  }`}
                >
                  <button type="button" onClick={() => setSelectedTable(table.id)}>
                    {table.label}
                    <span className="ml-1 text-slate-500">
                      {table.polygon ? `${table.polygon.length} pts` : "no zone"}
                      {table.cameraId && table.cameraId !== selectedCamera ? " · other camera" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={muted ? "text-amber-300" : "text-slate-500"}
                    disabled={busy}
                    onClick={() => void toggleMute(table.id, muted)}
                    title="Ignore this camera zone for five minutes"
                  >
                    {muted ? "muted" : "mute"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className={CARD}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Recent detections</h2>
          <button type="button" className={BTN} disabled={loadingLogs} onClick={() => void loadLogs()}>
            Refresh
          </button>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left">Time</th>
                <th className="text-left">Camera</th>
                <th className="text-left">Table</th>
                <th className="text-left">State</th>
                <th className="text-right">People</th>
                <th className="text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {detections.map((event) => (
                <tr key={event.id} className="border-t border-slate-800">
                  <td className="py-1 text-slate-400">{istTime(event.ts)}</td>
                  <td>{event.cameraName ?? "—"}</td>
                  <td>{event.tableLabel ?? "—"}</td>
                  <td className={event.state === "occupied" ? "text-amber-300" : "text-sky-300"}>
                    {event.state}
                  </td>
                  <td className="text-right font-mono">{event.personCount}</td>
                  <td className="text-right font-mono">{event.confidence.toFixed(2)}</td>
                </tr>
              ))}
              {detections.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-center text-slate-500">
                    No vision events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Tuning log</h2>
          <button type="button" className={BTN} disabled={loadingLogs} onClick={() => void loadLogs()}>
            Refresh
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Per-table counts and debounced states from the vision service (no images). Last{" "}
          {tuning?.rows.length ?? 0} rows.
        </p>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-slate-900 text-left uppercase tracking-wider text-slate-500">
              <tr>
                {tuning?.columns.map((column) => (
                  <th key={column} className="px-1 py-1">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tuning?.rows.map((row, index) => (
                <tr key={index} className="border-t border-slate-800">
                  {tuning.columns.map((column) => (
                    <td key={column} className="whitespace-nowrap px-1 py-0.5 text-slate-400">
                      {row[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
