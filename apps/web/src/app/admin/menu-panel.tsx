"use client";

import type { AdminItemDto, AdminMenuDto, MenuImportResult } from "@dinesense/core";
import { apiFetch, errorMessage, postJson } from "@/lib/client";
import { useMemo, useState, type FormEvent } from "react";
import { BTN, BTN_PRIMARY, CARD, INPUT, type Run } from "./ui";

export function MenuPanel({
  menu,
  busy,
  run,
  onChanged,
}: {
  menu: AdminMenuDto;
  busy: boolean;
  run: Run;
  onChanged: () => Promise<void>;
}) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MenuImportResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const flatItems = useMemo(
    () => menu.categories.flatMap((category) => category.items),
    [menu.categories],
  );
  const activeItem = flatItems.find((item) => item.id === selectedItem) ?? null;

  async function previewImport() {
    if (!importFile) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const response = await fetch("/api/admin/menu/import/preview", {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error("Could not preview this file");
      setPreview((await response.json()) as MenuImportResult);
    } catch (caught) {
      setPreviewError(errorMessage(caught));
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <h2 className="text-sm font-semibold text-slate-300">Menu import (CSV / XLSX)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Columns: category, item, local_name, variant, price_ground, price_first, veg(Y/N),
          needs_kitchen(Y/N). Prices are rupees; blank prices make the variant unavailable on that
          floor until edited.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(event) => {
              setImportFile(event.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="text-sm text-slate-300"
          />
          <button
            type="button"
            className={BTN}
            disabled={!importFile || previewing || busy}
            onClick={() => void previewImport()}
          >
            {previewing ? "Reading…" : "Preview"}
          </button>
          {preview ? (
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy || preview.groups.length === 0}
              onClick={() =>
                void run(async () => {
                  await postJson("/api/admin/menu/import", { groups: preview.groups });
                  setPreview(null);
                  setImportFile(null);
                  await onChanged();
                }, "Menu imported.")
              }
            >
              Import {preview.groups.length} item groups
            </button>
          ) : null}
        </div>
        {previewError ? <p className="mt-2 text-xs text-red-300">{previewError}</p> : null}
        {preview ? (
          <div className="mt-2 space-y-1 text-xs">
            <p className="text-slate-400">
              {preview.rowCount} rows · {preview.groups.length} items · {preview.errors.length} errors ·{" "}
              {preview.warnings.length} warnings
            </p>
            {preview.errors.map((entry) => (
              <p key={`e-${entry.rowNumber}-${entry.message}`} className="text-red-300">
                Row {entry.rowNumber}: {entry.message}
              </p>
            ))}
            {preview.warnings.map((entry) => (
              <p key={`w-${entry.rowNumber}-${entry.message}`} className="text-amber-300">
                Row {entry.rowNumber}: {entry.message}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <form
            className={CARD}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                await postJson("/api/admin/menu", {
                  entity: "category",
                  name: String(form.get("name") ?? ""),
                });
                await onChanged();
              });
              event.currentTarget.reset();
            }}
          >
            <h2 className="text-sm font-semibold text-slate-300">Categories</h2>
            <div className="mt-2 flex gap-2">
              <input name="name" placeholder="New category" className={INPUT} required />
              <button type="submit" className={BTN} disabled={busy}>
                Add
              </button>
            </div>
          </form>

          {menu.categories.map((category) => (
            <div key={category.id} className={CARD}>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run(async () => {
                    await apiFetch("/api/admin/menu", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        entity: "category",
                        id: category.id,
                        name: String(form.get("name") ?? ""),
                      }),
                    });
                    await onChanged();
                  });
                }}
              >
                <input name="name" defaultValue={category.name} className={INPUT} />
                <button type="submit" className={BTN} disabled={busy}>
                  Save
                </button>
                <button
                  type="button"
                  className="text-xs text-red-300"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await apiFetch("/api/admin/menu", {
                        method: "DELETE",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ entity: "category", id: category.id }),
                      });
                      await onChanged();
                    })
                  }
                >
                  Delete
                </button>
              </form>

              <ul className="mt-2 space-y-1">
                {category.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item.id)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                        selectedItem === item.id
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "text-slate-300"
                      }`}
                    >
                      {item.name}
                      <span className="ml-1 text-xs text-slate-500">
                        {item.isVeg ? "veg" : "non-veg"} · {item.variants.length} variants
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <form
                className="mt-2 space-y-2 border-t border-slate-800 pt-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run(async () => {
                    await postJson("/api/admin/menu", {
                      entity: "item",
                      categoryId: category.id,
                      name: String(form.get("name") ?? ""),
                      isVeg: form.get("isVeg") === "on",
                      needsKitchen: form.get("needsKitchen") === "on",
                    });
                    await onChanged();
                  });
                  event.currentTarget.reset();
                }}
              >
                <input name="name" placeholder="New item" className={INPUT} required />
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input name="isVeg" type="checkbox" defaultChecked /> Veg
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input name="needsKitchen" type="checkbox" defaultChecked /> Needs kitchen
                </label>
                <button type="submit" className={BTN} disabled={busy}>
                  Add item
                </button>
              </form>
            </div>
          ))}
        </div>

        <div className={CARD}>
          {!activeItem ? (
            <p className="text-sm text-slate-500">Select an item to edit it.</p>
          ) : (
            <ItemEditor
              key={`${activeItem.id}-${activeItem.name}-${activeItem.available}-${activeItem.active}`}
              item={activeItem}
              menu={menu}
              busy={busy}
              onChanged={onChanged}
              run={run}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ItemEditor({
  item,
  menu,
  busy,
  onChanged,
  run,
}: {
  item: AdminItemDto;
  menu: AdminMenuDto;
  busy: boolean;
  onChanged: () => Promise<void>;
  run: Run;
}) {
  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run(async () => {
            await apiFetch("/api/admin/menu", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                entity: "item",
                id: item.id,
                name: String(form.get("name") ?? ""),
                nameLocal: String(form.get("nameLocal") ?? "") || null,
                isVeg: form.get("isVeg") === "on",
                needsKitchen: form.get("needsKitchen") === "on",
                available: form.get("available") === "on",
                active: form.get("active") === "on",
              }),
            });
            await onChanged();
          }, "Item saved.");
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-300">Edit item</h2>
          <button
            type="button"
            className="text-xs text-red-300"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await apiFetch("/api/admin/menu", {
                  method: "DELETE",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ entity: "item", id: item.id }),
                });
                await onChanged();
              }, "Item removed.")
            }
          >
            Delete item
          </button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Name
            <input name="name" defaultValue={item.name} className={`${INPUT} mt-1`} />
          </label>
          <label className="text-xs text-slate-400">
            Local name
            <input name="nameLocal" defaultValue={item.nameLocal ?? ""} className={`${INPUT} mt-1`} />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
          <label className="flex items-center gap-1">
            <input name="isVeg" type="checkbox" defaultChecked={item.isVeg} /> Veg
          </label>
          <label className="flex items-center gap-1">
            <input name="needsKitchen" type="checkbox" defaultChecked={item.needsKitchen} /> Needs kitchen
          </label>
          <label className="flex items-center gap-1">
            <input name="available" type="checkbox" defaultChecked={item.available} /> Available
          </label>
          <label className="flex items-center gap-1">
            <input name="active" type="checkbox" defaultChecked={item.active} /> Active
          </label>
        </div>
        <button type="submit" className={`${BTN} mt-2`} disabled={busy}>
          Save item
        </button>
      </form>

      <div className="border-t border-slate-800 pt-3">
        <h3 className="text-sm font-semibold text-slate-300">Variants and floor prices</h3>
        {item.variants.map((variant) => (
          <form
            key={`${variant.id}-${variant.label}-${variant.prices.map((price) => `${price.zoneId}:${price.pricePaise}:${price.available}`).join("|")}`}
            className="mt-2 space-y-2 rounded-lg border border-slate-800 p-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                await apiFetch("/api/admin/menu", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    entity: "variant",
                    id: variant.id,
                    label: String(form.get("label") ?? ""),
                  }),
                });
                await apiFetch("/api/admin/menu/prices", {
                  method: "PUT",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    variantId: variant.id,
                    prices: menu.zones.map((zone) => ({
                      zoneId: zone.id,
                      pricePaise: Math.round(Number(form.get(`price-${zone.id}`) ?? 0) * 100),
                      available: form.get(`available-${zone.id}`) === "on",
                    })),
                  }),
                });
                await onChanged();
              }, "Variant saved.");
            }}
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-400">
                Label
                <input name="label" defaultValue={variant.label} className={`${INPUT} mt-1 w-32`} />
              </label>
              {menu.zones.map((zone) => {
                const price = variant.prices.find((entry) => entry.zoneId === zone.id);
                return (
                  <label key={zone.id} className="text-xs text-slate-400">
                    {zone.name} ₹
                    <input
                      name={`price-${zone.id}`}
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={((price?.pricePaise ?? 0) / 100).toFixed(2)}
                      className={`${INPUT} mt-1 w-24`}
                    />
                    <span className="ml-2 inline-flex items-center gap-1">
                      <input
                        name={`available-${zone.id}`}
                        type="checkbox"
                        defaultChecked={price?.available ?? false}
                      />
                      available
                    </span>
                  </label>
                );
              })}
              <button type="submit" className={BTN} disabled={busy}>
                Save
              </button>
              <button
                type="button"
                className="text-xs text-red-300"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await apiFetch("/api/admin/menu", {
                      method: "DELETE",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ entity: "variant", id: variant.id }),
                    });
                    await onChanged();
                  }, "Variant removed.")
                }
              >
                Remove
              </button>
            </div>
          </form>
        ))}
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(async () => {
              await postJson("/api/admin/menu", {
                entity: "variant",
                itemId: item.id,
                label: String(form.get("label") ?? ""),
              });
              await onChanged();
            }, "Variant added. Set its prices above.");
            event.currentTarget.reset();
          }}
        >
          <input name="label" placeholder="New variant (e.g. Half)" className={`${INPUT} max-w-xs`} required />
          <button type="submit" className={BTN} disabled={busy}>
            Add variant
          </button>
        </form>
      </div>
    </div>
  );
}
