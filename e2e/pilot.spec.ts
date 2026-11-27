import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, WAITER_PIN, loginAdminApi, loginPin, resetTables } from "./helpers";

test("shadow mode is visible to staff and the owner can review corrections", async ({
  browser,
  page,
  request,
}) => {
  await loginAdminApi(request);
  await resetTables(request);

  const enabled = await request.put("/api/admin/settings", {
    data: { settings: { SHADOW_MODE: true } },
  });
  expect(enabled.ok()).toBeTruthy();

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, WAITER_PIN);
  await expect(waiter.getByText(/Pilot shadow mode/)).toBeVisible();

  const snapshot = (await (await request.get("/api/snapshot")).json()) as {
    tables: Array<{ id: string; label: string }>;
  };
  const g3 = snapshot.tables.find((table) => table.label === "G3");
  expect(g3).toBeDefined();
  if (!g3) return;
  await request.post("/api/dev/simulate", { data: { tableId: g3.id, state: "empty" } });
  await request.post(`/api/tables/${g3.id}/state`, { data: { state: "occupied" } });

  await page.goto("/login");
  await page.getByRole("button", { name: "Admin password" }).click();
  await page.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "Pilot" }).click();
  await expect(page.getByText("Manual corrections by table")).toBeVisible();
  await expect(page.getByText(/mismatch/).first()).toBeVisible({ timeout: 15_000 });

  const review = (await (await request.get("/api/admin/pilot/review")).json()) as {
    date: string;
  };
  await page.getByPlaceholder(/Complaints/).fill("Pilot E2E note");
  await page.getByRole("button", { name: "Save pilot note" }).click();
  await expect(page.getByText(/Pilot note saved/)).toBeVisible();
  await request.put("/api/admin/pilot/notes", { data: { date: review.date, note: "" } });

  await request.put("/api/admin/settings", { data: { settings: { SHADOW_MODE: false } } });
  await request.post(`/api/tables/${g3.id}/state`, { data: { state: "free" } });
  await waiterContext.close();
});
