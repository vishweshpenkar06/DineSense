import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, loginAdminApi, resetTables } from "./helpers";

const IMPORT_CSV = `category,item,local_name,variant,price_ground,price_first,veg,needs_kitchen
E2E Import,E2E Momo,,Half,50,60,Y,Y
`;

test("owner configures settings, tables and imports a menu without the database", async ({
  page,
  request,
}) => {
  await loginAdminApi(request);
  await resetTables(request);

  const floorsBefore = (await (await request.get("/api/admin/floors")).json()) as {
    zones: Array<{ tables: Array<{ id: string; label: string }> }>;
  };
  for (const zone of floorsBefore.zones) {
    for (const table of zone.tables) {
      if (table.label === "T9") {
        await request.fetch("/api/admin/floors", {
          method: "DELETE",
          data: { entity: "table", id: table.id },
        });
      }
    }
  }

  await page.goto("/login");
  await page.getByRole("button", { name: "Admin password" }).click();
  await page.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Decision window (s)").fill("240");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect
    .poll(async () => {
      const response = await request.get("/api/admin/settings");
      const data = (await response.json()) as { settings: { DECIDE_WINDOW_S: number } };
      return data.settings.DECIDE_WINDOW_S;
    })
    .toBe(240);
  await request.put("/api/admin/settings", { data: { settings: { DECIDE_WINDOW_S: 120 } } });

  await page.getByRole("button", { name: "Floors & tables" }).click();
  await page.getByPlaceholder("New table label").first().fill("T9");
  await page.getByRole("button", { name: "Add table" }).first().click();
  await expect
    .poll(async () => {
      const response = await request.get("/api/snapshot");
      const data = (await response.json()) as { tables: Array<{ label: string }> };
      return data.tables.some((table) => table.label === "T9");
    })
    .toBe(true);
  await page.getByRole("button", { name: "Remove table T9" }).click();
  await expect
    .poll(async () => {
      const response = await request.get("/api/snapshot");
      const data = (await response.json()) as { tables: Array<{ label: string }> };
      return data.tables.some((table) => table.label === "T9");
    })
    .toBe(false);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-menu.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(IMPORT_CSV),
  });
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: /Import 1 item groups/ }).click();
  await expect(page.getByText("Menu imported.")).toBeVisible();

  const menu = (await (await request.get("/api/admin/menu")).json()) as {
    categories: Array<{
      id: string;
      name: string;
      items: Array<{ id: string; name: string }>;
    }>;
  };
  const category = menu.categories.find((entry) => entry.name === "E2E Import");
  const item = category?.items.find((entry) => entry.name === "E2E Momo");
  expect(category).toBeDefined();
  expect(item).toBeDefined();
  if (item && category) {
    await request.fetch("/api/admin/menu", {
      method: "DELETE",
      data: { entity: "item", id: item.id },
    });
    await request.fetch("/api/admin/menu", {
      method: "DELETE",
      data: { entity: "category", id: category.id },
    });
  }

  await page.getByRole("button", { name: "Overview" }).click();
  await expect(page.getByText("Earnings", { exact: true })).toBeVisible();
  await expect(page.getByText("Export CSV")).toBeVisible();

  await page.getByRole("button", { name: "Health" }).click();
  await expect(page.getByText(/System health:/)).toBeVisible();
  const diagnostics = await request.get("/api/admin/diagnostics");
  expect(diagnostics.ok()).toBeTruthy();
  expect(diagnostics.headers()["content-type"]).toContain("application/zip");
});
