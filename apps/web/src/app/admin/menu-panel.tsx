"use client";

import type { AdminItemDto, AdminMenuDto, MenuImportResult } from "@dinesense/core";
import { apiFetch, errorMessage, postJson } from "@/lib/client";
import { CircleAlert, Upload, UtensilsCrossed } from "lucide-react";
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
  const [showArchived, setShowArchived] = useState(false);

  const flatItems = useMemo(
    () => menu.categories.flatMap((category) => category.items),
    [menu.categories],
  );
  const activeItem = flatItems.find((item) => item.id === selectedItem) ?? null;
  const archivedCategories = menu.categories.filter(
    (category) => !category.items.some((item) => item.active),
  ).length;
  const visibleCategories = showArchived
    ? menu.categories
    : menu.categories.filter((category) => category.items.some((item) => item.active));

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Import menu</h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted">
              CSV or XLSX with category, item, local_name, variant, price_ground (non-AC), price_first
              (AC), veg(Y/N), needs_kitchen(Y/N). Prices are in rupees; leave a floor price blank to
              mark that variant unavailable there.
            </p>
          </div>
          <span className="rounded-full border border-line px-2.5 py-1 text-[10px] text-faint">CSV / XLSX</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className={`${BTN} cursor-pointer`}>
            <Upload className="h-3.5 w-3.5" /> Choose file
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(event) => {
                setImportFile(event.target.files?.[0] ?? null);
                setPreview(null);
              }}
              className="sr-only"
            />
          </label>
          <span className="max-w-[240px] truncate text-[11px] text-muted">
            {importFile?.name ?? "No file chosen"}
          </span>
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
        {previewError ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-coral">
            <CircleAlert className="h-3.5 w-3.5" /> {previewError}
          </p>
        ) : null}
        {preview ? (
          <div className="mt-3 space-y-1 rounded-xl border border-line bg-canvas/40 p-3 text-[11px]">
            <p className="text-muted">
              {preview.rowCount} rows · {preview.groups.length} items · {preview.errors.length} errors ·{" "}
              {preview.warnings.length} warnings
            </p>
            {preview.errors.map((entry) => (
              <p key={`e-${entry.rowNumber}-${entry.message}`} className="text-coral">
                Row {entry.rowNumber}: {entry.message}
              </p>
            ))}
            {preview.warnings.map((entry) => (
              <p key={`w-${entry.rowNumber}-${entry.message}`} className="text-accent">
                Row {entry.rowNumber}: {entry.message}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Categories</h2>
              {archivedCategories > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowArchived((value) => !value)}
                  className="text-[10px] font-medium text-faint transition hover:text-ink"
                >
                  {showArchived ? "Hide archived" : `Show archived (${archivedCategories})`}
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex gap-2">
              <input name="name" placeholder="New category" className={INPUT} required />
              <button type="submit" className={BTN} disabled={busy}>
                Add
              </button>
            </div>
          </form>

          {visibleCategories.map((category) => (
            <div key={category.id} className={CARD}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
                  Category
                </h3>
                <span className="text-[10px] text-faint">
                  {category.items.filter((item) => item.active).length} active
                </span>
              </div>
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
                  className="text-[11px] font-medium text-coral"
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

              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {(showArchived ? category.items : category.items.filter((item) => item.active)).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedItem(item.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                        selectedItem === item.id
                          ? "bg-accent text-canvas"
                          : item.active
                            ? "text-ink hover:bg-raised"
                            : "text-faint hover:bg-raised"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {item.name}
                        {!item.active ? <span className="ml-1.5 text-[10px]">archived</span> : null}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] ${
                          selectedItem === item.id ? "text-canvas/60" : "text-faint"
                        }`}
                      >
                        {item.isVeg ? "veg" : "non-veg"} · {item.variants.length}
                      </span>
                    </button>
                  </li>
                ))}
                {(showArchived ? category.items.length : category.items.filter((item) => item.active).length) === 0 ? (
                  <li className="px-2 py-2 text-xs text-faint">No active items.</li>
                ) : null}
              </ul>

              <details className="group mt-2 border-t border-line pt-2">
                <summary className="cursor-pointer list-none text-[11px] font-medium text-accent">
                  + Add item
                </summary>
              <form
                className="mt-2 space-y-2"
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
                <button type="submit" className={`${BTN} w-full`} disabled={busy}>
                  Add item
                </button>
              </form>
              </details>
            </div>
          ))}
        </div>

        <div className={`${CARD} h-fit lg:sticky lg:top-5`}>
          {!activeItem ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-faint">
                <UtensilsCrossed className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-medium">Select a dish to edit</p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
                Change names, variants, floor prices and availability. The waiter menu updates instantly.
              </p>
            </div>
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
          <h2 className="text-sm font-semibold text-ink">Edit item</h2>
          <button
            type="button"
            className="text-[11px] font-medium text-coral"
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

      <div className="border-t border-line pt-3">
        <h3 className="text-sm font-semibold text-ink">Variants and floor prices</h3>
        {item.variants.map((variant) => (
          <form
            key={`${variant.id}-${variant.label}-${variant.prices.map((price) => `${price.zoneId}:${price.pricePaise}:${price.available}`).join("|")}`}
            className="mt-2 space-y-2 rounded-xl border border-line bg-canvas/30 p-3"
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
                className="text-[11px] font-medium text-coral"
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
