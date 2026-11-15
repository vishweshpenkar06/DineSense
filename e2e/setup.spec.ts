import { expect, test } from "@playwright/test";
import { loginAdminApi, resetTables } from "./helpers";

test("fresh owner is sent to the setup wizard and can finish it", async ({ page, request }) => {
  await loginAdminApi(request);
  await resetTables(request);
  const reopened = await request.post("/api/admin/setup/reopen");
  expect(reopened.ok()).toBeTruthy();

  await page.goto("/login");
  await page.getByRole("button", { name: "Admin password" }).click();
  await page.getByPlaceholder("Admin password").fill("admin123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByRole("button", { name: "7. Test" }).click();
  await page.getByRole("button", { name: "Run the test" }).click();
  await expect(page.getByText(/Test data cleaned/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Bill paid/)).toBeVisible();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });

  await expect
    .poll(async () => {
      const response = await request.get("/api/admin/setup/status");
      const data = (await response.json()) as { complete: boolean };
      return data.complete;
    })
    .toBe(true);
});
