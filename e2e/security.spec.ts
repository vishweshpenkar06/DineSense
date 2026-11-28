import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, WAITER_PIN, loginPin } from "./helpers";

test("anonymous health is minimal and protected routes require a session", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const body = (await health.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["ok", "status"]);

  const admin = await request.get("/api/admin/settings");
  expect(admin.status()).toBe(401);
});

test("wrong role and deactivated sessions cannot use staff APIs", async ({ browser, request }) => {
  await request.post("/api/auth/login", { data: { password: ADMIN_PASSWORD } });
  const staffResponse = await request.get("/api/admin/staff");
  const staff = ((await staffResponse.json()) as {
    staff: Array<{ id: string; name: string; role: string; active: boolean }>;
  }).staff;
  const waiter = staff.find((entry) => entry.role === "WAITER" && entry.active);
  expect(waiter).toBeTruthy();

  const waiterContext = await browser.newContext();
  const page = await waiterContext.newPage();
  await loginPin(page, WAITER_PIN);
  await expect(page).toHaveURL(/\/waiter$/);
  const forbidden = await page.evaluate(async () => {
    const response = await fetch("/api/admin/settings");
    return response.status;
  });
  expect(forbidden).toBe(403);

  try {
    await request.patch(`/api/admin/staff`, {
      data: { id: waiter!.id, active: false },
    });
    const deactivatedStatus = await page.evaluate(async () => {
      const response = await fetch("/api/snapshot");
      return response.status;
    });
    expect(deactivatedStatus).toBe(401);
  } finally {
    await request.patch(`/api/admin/staff`, {
      data: { id: waiter!.id, active: true },
    });
  }

  await waiterContext.close();
});
