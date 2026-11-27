import { expect, test, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_PASSWORD, CHEF_PIN, RECEPTIONIST_PIN, WAITER_PIN, loginAdminApi, loginPin, resetTables } from "./helpers";

const SHOTS = path.join(process.cwd(), "docs", "screenshots");

async function adminPage(
  browser: Browser,
  theme: "light" | "dark",
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((value) => {
    window.localStorage.setItem("dinesense.theme", value);
  }, theme);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Admin password" }).click();
  await page.getByPlaceholder("Admin password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return { context, page };
}

test("capture role screens for visual review", async ({ browser, request }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await loginAdminApi(request);
  await resetTables(request);

  const views = [
    { role: "waiter", viewport: { width: 390, height: 844 }, pin: WAITER_PIN },
    { role: "chef", viewport: { width: 1024, height: 768 }, pin: CHEF_PIN },
    { role: "reception", viewport: { width: 1440, height: 900 }, pin: RECEPTIONIST_PIN },
  ] as const;

  for (const theme of ["light", "dark"] as const) {
    for (const view of views) {
      const context = await browser.newContext({ viewport: view.viewport });
      await context.addInitScript((value) => {
        window.localStorage.setItem("dinesense.theme", value);
      }, theme);
      const page = await context.newPage();
      await loginPin(page, view.pin);
      await expect(page).toHaveURL(new RegExp(`/${view.role}$`));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOTS, `${view.role}-${theme}.png`) });
      await context.close();
    }
  }

  for (const theme of ["light", "dark"] as const) {
    const { context, page } = await adminPage(browser, theme, { width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, `admin-${theme}.png`) });
    await context.close();
  }

  for (const theme of ["light", "dark"] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((value) => {
      window.localStorage.setItem("dinesense.theme", value);
    }, theme);
    const page = await context.newPage();
    const response = await page.goto("/dev/ui");
    if (response?.status() === 200) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOTS, `ui-gallery-${theme}.png`) });
      await page.screenshot({ path: path.join(SHOTS, `ui-gallery-${theme}-full.png`), fullPage: true });
    }
    await context.close();
  }

  await resetTables(request);
});
