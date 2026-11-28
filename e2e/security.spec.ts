import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, CHEF_PIN, WAITER_PIN, loginPin } from "./helpers";

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

test("camera snapshots are limited to admin and permitted waiters", async ({ browser, request }) => {
  await request.post("/api/auth/login", { data: { password: ADMIN_PASSWORD } });
  const cameras = ((await (await request.get("/api/admin/cameras")).json()) as {
    cameras: Array<{ id: string }>;
  }).cameras;
  expect(cameras.length).toBeGreaterThan(0);
  const cameraId = cameras[0]!.id;

  const chefContext = await browser.newContext();
  const chef = await chefContext.newPage();
  await loginPin(chef, CHEF_PIN);
  await expect(chef).toHaveURL(/\/chef$/);
  const chefStatus = await chef.evaluate(async (id) => {
    const response = await fetch(`/api/camera/${id}/snapshot.jpg`);
    return response.status;
  }, cameraId);
  expect(chefStatus).toBe(403);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, WAITER_PIN);
  await expect(waiter).toHaveURL(/\/waiter$/);
  const waiterStatus = await waiter.evaluate(async (id) => {
    const response = await fetch(`/api/camera/${id}/snapshot.jpg`);
    return response.status;
  }, cameraId);
  expect(waiterStatus).toBe(200);

  await chefContext.close();
  await waiterContext.close();
});
