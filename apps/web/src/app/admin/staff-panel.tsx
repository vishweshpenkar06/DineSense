"use client";

import type { AdminStaffDto } from "@dinesense/core";
import { apiFetch, postJson } from "@/lib/client";
import { BTN, CARD, INPUT, type Run } from "./ui";

export function StaffPanel({
  staff,
  busy,
  run,
  onChanged,
}: {
  staff: AdminStaffDto[];
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
          const role = String(form.get("role") ?? "WAITER");
          void run(async () => {
            await postJson("/api/admin/staff", {
              name: String(form.get("name") ?? ""),
              role,
              pin: role === "ADMIN" ? undefined : String(form.get("pin") ?? "") || undefined,
              password: role === "ADMIN" ? String(form.get("password") ?? "") || undefined : undefined,
            });
            await onChanged();
          }, "Staff member added.");
          event.currentTarget.reset();
        }}
      >
        <h2 className="text-sm font-semibold text-slate-300">Add staff</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input name="name" placeholder="Name" className={INPUT} required />
          <select name="role" defaultValue="WAITER" className={INPUT}>
            <option value="WAITER">Waiter</option>
            <option value="CHEF">Chef</option>
            <option value="RECEPTIONIST">Receptionist</option>
            <option value="ADMIN">Admin</option>
          </select>
          <input name="pin" placeholder="PIN (4–6 digits)" className={INPUT} />
          <input name="password" placeholder="Admin password" className={INPUT} />
        </div>
        <button type="submit" className={`${BTN} mt-2`} disabled={busy}>
          Add staff
        </button>
      </form>

      <div className={CARD}>
        <h2 className="text-sm font-semibold text-slate-300">Staff</h2>
        <ul className="mt-2 divide-y divide-slate-800">
          {staff.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="text-sm font-medium">{member.name}</p>
                <p className="text-xs text-slate-500">
                  {member.role.toLowerCase()} · {member.active ? "active" : "inactive"} ·{" "}
                  {member.hasPassword ? "password" : "PIN"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <form
                  className="flex items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const value = String(form.get("credential") ?? "");
                    void run(async () => {
                      await apiFetch("/api/admin/staff", {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          id: member.id,
                          pin: member.role === "ADMIN" ? undefined : value || undefined,
                          password: member.role === "ADMIN" ? value || undefined : undefined,
                        }),
                      });
                      await onChanged();
                    }, "Credential updated.");
                    event.currentTarget.reset();
                  }}
                >
                  <input
                    name="credential"
                    placeholder={member.role === "ADMIN" ? "New password" : "New PIN"}
                    className={`${INPUT} w-36`}
                  />
                  <button type="submit" className={BTN} disabled={busy}>
                    Set
                  </button>
                </form>
                <button
                  type="button"
                  className={BTN}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await apiFetch("/api/admin/staff", {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ id: member.id, active: !member.active }),
                      });
                      await onChanged();
                    })
                  }
                >
                  {member.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
