import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, loginAdminApi, resetTables, waitForCameraSnapshots } from "./helpers";

test("owner calibrates a table zone and reviews detections and tuning", async ({
  page,
  request,
}) => {
  await loginAdminApi(request);
  await waitForCameraSnapshots(request);
  await resetTables(request);

  await page.goto("/login");
  await page.getByRole("button", { name: "Admin password" }).click();
  await page.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("button", { name: "Cameras" }).click();
  await expect(page.getByText("Add a camera")).toBeVisible();
  await page.getByRole("button", { name: "Calibrate" }).first().click();
  await expect(page.getByText(/Calibrate Ground Camera/)).toBeVisible();

  const frame = page.getByAltText("Camera frame for calibration");
  await expect(frame).toBeVisible();
  await expect
    .poll(async () => frame.evaluate((element) => (element as HTMLImageElement).naturalWidth), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  const cameras = (await (await request.get("/api/admin/cameras")).json()) as {
    cameras: Array<{ id: string; name: string }>;
  };
  const camera = cameras.cameras.find((entry) => entry.name === "Ground Camera");
  expect(camera).toBeDefined();
  if (!camera) return;

  const before = (await (
    await request.get(`/api/admin/cameras/${camera.id}/calibration`)
  ).json()) as {
    tables: Array<{ id: string; label: string; polygon: number[][] | null }>;
  };
  const g1 = before.tables.find((table) => table.label === "G1");
  expect(g1).toBeDefined();
  if (!g1) return;

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  for (const [fx, fy] of [
    [0.1, 0.15],
    [0.3, 0.15],
    [0.3, 0.45],
    [0.1, 0.45],
  ]) {
    await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
  }

  await page.getByRole("button", { name: /Save zone for G1/ }).click();
  await expect(page.getByText(/Zone saved/)).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => {
      const response = await request.get(`/api/admin/cameras/${camera.id}/calibration`);
      const data = (await response.json()) as {
        tables: Array<{ label: string; polygon: number[][] | null }>;
      };
      return data.tables.find((table) => table.label === "G1")?.polygon?.length ?? 0;
    })
    .toBe(4);

  if (g1.polygon) {
    await request.fetch(`/api/admin/cameras/${camera.id}/calibration`, {
      method: "PUT",
      data: { tableId: g1.id, polygon: g1.polygon },
    });
  }

  const snapshot = (await (await request.get("/api/snapshot")).json()) as {
    tables: Array<{ id: string }>;
  };
  const firstTable = snapshot.tables[0];
  if (firstTable) {
    await request.post("/api/dev/simulate", { data: { tableId: firstTable.id, state: "occupied" } });
  }

  await expect(page.getByText("Recent detections")).toBeVisible();
  await expect(page.getByText("Tuning log")).toBeVisible();
  await expect
    .poll(
      async () => {
        const response = await request.get("/api/admin/vision/events?limit=5");
        if (!response.ok()) return 0;
        const data = (await response.json()) as { events?: unknown[] };
        return Array.isArray(data.events) ? data.events.length : 0;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const response = await request.get("/api/admin/vision/tuning?tail=5");
      if (!response.ok()) return 0;
      const data = (await response.json()) as { rows?: unknown[] };
      return Array.isArray(data.rows) ? data.rows.length : 0;
    }, { timeout: 30_000 })
    .toBeGreaterThan(0);
});
