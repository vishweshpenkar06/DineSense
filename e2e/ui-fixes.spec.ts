import { expect, test } from "@playwright/test";
import { RECEPTIONIST_PIN, WAITER_PIN, addFirstVariant, loginAdminApi, loginPin, openTableOrder, resetTables } from "./helpers";

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
]) {
  test(`reception payment is visible at ${viewport.width}x${viewport.height}`, async ({ browser, request }) => {
    await loginAdminApi(request);
    await resetTables(request);

    const waiterContext = await browser.newContext({ viewport });
    const waiter = await waiterContext.newPage();
    await loginPin(waiter, WAITER_PIN);
    await openTableOrder(waiter, "G3");
    await addFirstVariant(waiter);
    await waiter.getByRole("button", { name: "Send to kitchen" }).click();
    await waiter.waitForURL(/\/waiter$/);

    const receptionContext = await browser.newContext({ viewport });
    const reception = await receptionContext.newPage();
    await loginPin(reception, RECEPTIONIST_PIN);
    await expect(reception).toHaveURL(/\/reception$/);
    await reception.getByRole("button", { name: /G3/ }).first().click();
    const pay = reception.getByRole("button", { name: "Take payment & close" });
    await expect(pay).toBeVisible();
    await expect
      .poll(async () => {
        const box = await pay.boundingBox();
        return box ? box.y + box.height : Number.MAX_SAFE_INTEGER;
      })
      .toBeLessThanOrEqual(viewport.height);

    await waiterContext.close();
    await receptionContext.close();
  });
}

test("waiter table grid is two columns at 390px", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await loginPin(page, WAITER_PIN);
  const columns = await page.locator('[data-testid="table-grid"]').first().evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(columns).toBe(2);
  await context.close();
});

test("sign out asks before leaving with queued orders", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await loginPin(page, WAITER_PIN);
  await openTableOrder(page, "G4");
  await addFirstVariant(page);
  await page.context().route("**/api/orders", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "down" }) }),
  );
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await page.waitForURL(/\/waiter$/);
  await expect(page.getByText(/^\d+ orders? queued/)).toBeVisible();

  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Out" }).click();
  await expect(page).toHaveURL(/\/waiter$/);

  await context.close();
});
