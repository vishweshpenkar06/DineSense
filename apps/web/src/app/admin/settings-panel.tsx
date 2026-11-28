"use client";

import type { AdminSettingsDto } from "@dinesense/core";
import { apiFetch } from "@/lib/client";
import { useState } from "react";
import { BTN_PRIMARY, CARD, INPUT, type Run } from "./ui";

export function SettingsPanel({
  data,
  busy,
  run,
  onChanged,
}: {
  data: AdminSettingsDto;
  busy: boolean;
  run: Run;
  onChanged: () => Promise<void>;
}) {
  const [qr, setQr] = useState(data.restaurant.upiQrUrl ?? "");

  async function readQrFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 500_000) {
      window.alert("Please choose a QR image under 500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setQr(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <form
        className={CARD}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const settings: Record<string, unknown> = {};
          for (const key of [
            "DECIDE_WINDOW_S",
            "SEATED_CONFIRM_S",
            "EMPTY_CONFIRM_S",
            "SNOOZE_S",
            "REALERT_S",
            "ALERT_ESCALATE_S",
            "VISION_MUTE_S",
            "TICKET_AMBER_S",
            "TICKET_RED_S",
            "TAX_RATE_PERCENT",
          ]) {
            settings[key] = Number(form.get(key) ?? 0);
          }
          settings.BUSINESS_DAY_START = String(form.get("BUSINESS_DAY_START") ?? "05:00");
          settings.TAX_MODE = String(form.get("TAX_MODE") ?? "exclusive");
          settings.BILL_NUMBER_PREFIX = String(form.get("BILL_NUMBER_PREFIX") ?? "DS");
          settings.SHADOW_MODE = form.get("SHADOW_MODE") === "on";
          void run(async () => {
            await apiFetch("/api/admin/settings", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ settings }),
            });
            await onChanged();
          }, "Settings saved.");
        }}
      >
        <h2 className="text-sm font-semibold text-slate-300">Timers, tax and business day</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["DECIDE_WINDOW_S", "Decision window (s)"],
            ["SEATED_CONFIRM_S", "Seated confirm (s)"],
            ["EMPTY_CONFIRM_S", "Empty confirm (s)"],
            ["SNOOZE_S", "Snooze (s)"],
            ["REALERT_S", "Re-alert (s)"],
            ["ALERT_ESCALATE_S", "Escalate (s)"],
            ["VISION_MUTE_S", "Vision mute (s)"],
            ["TICKET_AMBER_S", "Ticket amber (s)"],
            ["TICKET_RED_S", "Ticket red (s)"],
            ["TAX_RATE_PERCENT", "Default GST rate (%)"],
          ].map(([key, label]) => (
            <label key={key} className="text-xs text-slate-400">
              {label}
              <input
                name={key}
                type="number"
                step="0.01"
                defaultValue={String(data.settings[key as keyof typeof data.settings])}
                className={`${INPUT} mt-1`}
              />
            </label>
          ))}
          <label className="text-xs text-slate-400">
            Business day start
            <input
              name="BUSINESS_DAY_START"
              defaultValue={data.settings.BUSINESS_DAY_START}
              className={`${INPUT} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-400">
            Tax mode
            <select name="TAX_MODE" defaultValue={data.settings.TAX_MODE} className={`${INPUT} mt-1`}>
              <option value="exclusive">Exclusive</option>
              <option value="inclusive">Inclusive</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Bill prefix
            <input
              name="BILL_NUMBER_PREFIX"
              defaultValue={data.settings.BILL_NUMBER_PREFIX}
              className={`${INPUT} mt-1`}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-xs text-slate-300">
            <input name="SHADOW_MODE" type="checkbox" defaultChecked={data.settings.SHADOW_MODE} />
            Shadow mode (pilot: keep paper as backup)
          </label>
        </div>
        <button type="submit" className={`${BTN_PRIMARY} mt-3`} disabled={busy}>
          Save settings
        </button>
      </form>

      <form
        className={CARD}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run(async () => {
            await apiFetch("/api/admin/restaurant", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: String(form.get("name") ?? ""),
                address: String(form.get("address") ?? ""),
                phone: String(form.get("phone") ?? "") || null,
                registrationType: String(form.get("registrationType") ?? "") || null,
                gstin: String(form.get("gstin") ?? "") || null,
                fssai: String(form.get("fssai") ?? "") || null,
                upiId: String(form.get("upiId") ?? "") || null,
                upiName: String(form.get("upiName") ?? "") || null,
                upiQrUrl: qr || null,
                billFooter: String(form.get("billFooter") ?? "") || null,
              }),
            });
            await onChanged();
          }, "Restaurant profile saved.");
        }}
      >
        <h2 className="text-sm font-semibold text-slate-300">Restaurant profile</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Name
            <input name="name" defaultValue={data.restaurant.name} className={`${INPUT} mt-1`} />
          </label>
          <label className="text-xs text-slate-400">
            Phone
            <input name="phone" defaultValue={data.restaurant.phone ?? ""} className={`${INPUT} mt-1`} />
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">
            Address
            <input name="address" defaultValue={data.restaurant.address} className={`${INPUT} mt-1`} />
          </label>
          <label className="text-xs text-slate-400">
            GST registration type
            <select
              name="registrationType"
              defaultValue={data.restaurant.registrationType ?? ""}
              className={`${INPUT} mt-1`}
            >
              <option value="">Not set</option>
              <option value="REGULAR">Regular</option>
              <option value="COMPOSITION">Composition</option>
              <option value="UNREGISTERED">Unregistered</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            GSTIN
            <input name="gstin" defaultValue={data.restaurant.gstin ?? ""} className={`${INPUT} mt-1`} />
          </label>
          <label className="text-xs text-slate-400">
            FSSAI licence
            <input name="fssai" defaultValue={data.restaurant.fssai ?? ""} className={`${INPUT} mt-1`} />
          </label>
          <label className="text-xs text-slate-400">
            Shop UPI ID
            <input
              name="upiId"
              defaultValue={data.restaurant.upiId ?? ""}
              placeholder="shop@upi"
              className={`${INPUT} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-400">
            UPI payee name
            <input
              name="upiName"
              defaultValue={data.restaurant.upiName ?? ""}
              placeholder="Restaurant name"
              className={`${INPUT} mt-1`}
            />
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">
            Shop UPI QR image (optional; used instead of generating from UPI ID)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void readQrFile(event.target.files?.[0])}
              className="mt-1 block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-2 file:text-xs file:text-ink"
            />
            <input
              value={qr.startsWith("data:") ? "" : qr}
              onChange={(event) => setQr(event.target.value)}
              placeholder="…or paste a hosted QR image URL"
              className={`${INPUT} mt-2`}
            />
            {qr ? (
              <span className="mt-2 flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Shop UPI QR preview" className="h-16 w-16 rounded-lg bg-white object-contain p-1" />
                <button type="button" className="text-[11px] text-coral" onClick={() => setQr("")}>
                  Remove QR
                </button>
              </span>
            ) : null}
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">
            Bill footer
            <input
              name="billFooter"
              defaultValue={data.restaurant.billFooter ?? ""}
              className={`${INPUT} mt-1`}
            />
          </label>
        </div>
        <button type="submit" className={`${BTN_PRIMARY} mt-3`} disabled={busy}>
          Save restaurant
        </button>
      </form>
    </div>
  );
}
