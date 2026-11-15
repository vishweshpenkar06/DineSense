"use client";

import type { AdminFloorsDto } from "@dinesense/core";
import { apiFetch, postJson } from "@/lib/client";
import { BTN, CARD, INPUT, type Run } from "./ui";

export function FloorsPanel({
  floors,
  busy,
  run,
  onChanged,
}: {
  floors: AdminFloorsDto;
  busy: boolean;
  run: Run;
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <form
        className={CARD}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run(async () => {
            await postJson("/api/admin/floors", {
              entity: "zone",
              name: String(form.get("name") ?? ""),
              isAc: form.get("isAc") === "on",
            });
            await onChanged();
          });
          event.currentTarget.reset();
        }}
      >
        <h2 className="text-sm font-semibold text-slate-300">Add a floor</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input name="name" placeholder="Floor name" className={`${INPUT} max-w-xs`} required />
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input name="isAc" type="checkbox" /> AC
          </label>
          <button type="submit" className={BTN} disabled={busy}>
            Add floor
          </button>
        </div>
      </form>

      {floors.zones.map((zone) => (
        <div key={zone.id} className={CARD}>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                await apiFetch("/api/admin/floors", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    entity: "zone",
                    id: zone.id,
                    name: String(form.get("name") ?? ""),
                    isAc: form.get("isAc") === "on",
                    surchargeType: String(form.get("surchargeType") ?? "NONE"),
                    surchargeValue: Number(form.get("surchargeValue") ?? 0),
                  }),
                });
                await onChanged();
              });
            }}
          >
            <label className="text-xs text-slate-400">
              Name
              <input name="name" defaultValue={zone.name} className={`${INPUT} mt-1`} />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input name="isAc" type="checkbox" defaultChecked={zone.isAc} /> AC
            </label>
            <label className="text-xs text-slate-400">
              Surcharge
              <select name="surchargeType" defaultValue={zone.surchargeType} className={`${INPUT} mt-1`}>
                <option value="NONE">None</option>
                <option value="FLAT">Flat (paise)</option>
                <option value="PERCENT">Percent</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Value
              <input
                name="surchargeValue"
                type="number"
                min={0}
                defaultValue={zone.surchargeValue}
                className={`${INPUT} mt-1 w-24`}
              />
            </label>
            <button type="submit" className={BTN} disabled={busy}>
              Save floor
            </button>
            <button
              type="button"
              className="text-xs text-red-300"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await apiFetch("/api/admin/floors", {
                    method: "DELETE",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ entity: "zone", id: zone.id }),
                  });
                  await onChanged();
                })
              }
            >
              Delete floor
            </button>
          </form>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left">Table</th>
                  <th className="text-left">Seats</th>
                  <th className="text-left">Camera</th>
                  <th className="text-left">State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {zone.tables.map((table) => (
                  <tr key={table.id} className="border-t border-slate-800">
                    <td className="py-2 pr-2">
                      <input
                        form={`table-${table.id}`}
                        name="label"
                        defaultValue={table.label}
                        className={INPUT}
                      />
                    </td>
                    <td className="pr-2">
                      <input
                        form={`table-${table.id}`}
                        name="seats"
                        type="number"
                        min={1}
                        max={50}
                        defaultValue={table.seats}
                        className={`${INPUT} w-20`}
                      />
                    </td>
                    <td className="pr-2">
                      <select
                        form={`table-${table.id}`}
                        name="cameraId"
                        defaultValue={table.cameraId ?? ""}
                        className={INPUT}
                      >
                        <option value="">No camera</option>
                        {floors.cameras
                          .filter((camera) => camera.zoneId === zone.id)
                          .map((camera) => (
                            <option key={camera.id} value={camera.id}>
                              {camera.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="pr-2 text-xs text-slate-400">{table.state}</td>
                    <td className="text-right">
                      <form
                        id={`table-${table.id}`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          void run(async () => {
                            await apiFetch("/api/admin/floors", {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({
                                entity: "table",
                                id: table.id,
                                label: String(form.get("label") ?? ""),
                                seats: Number(form.get("seats") ?? 4),
                                cameraId: String(form.get("cameraId") ?? "") || null,
                              }),
                            });
                            await onChanged();
                          });
                        }}
                      >
                        <button type="submit" className={BTN} disabled={busy}>
                          Save
                        </button>
                      </form>
                      <button
                        type="button"
                        aria-label={`Remove table ${table.label}`}
                        className="ml-2 text-xs text-red-300"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await apiFetch("/api/admin/floors", {
                              method: "DELETE",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ entity: "table", id: table.id }),
                            });
                            await onChanged();
                          })
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                await postJson("/api/admin/floors", {
                  entity: "table",
                  zoneId: zone.id,
                  label: String(form.get("label") ?? ""),
                  seats: Number(form.get("seats") ?? 4),
                });
                await onChanged();
              });
              event.currentTarget.reset();
            }}
          >
            <input name="label" placeholder="New table label" className={`${INPUT} max-w-[160px]`} required />
            <input
              name="seats"
              type="number"
              min={1}
              max={50}
              defaultValue={4}
              className={`${INPUT} w-20`}
            />
            <button type="submit" className={BTN} disabled={busy}>
              Add table
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
