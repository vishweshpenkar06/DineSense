import { expect, test } from "@playwright/test";
import {
  addFirstVariant,
  kitchenTicketsFor,
  loginAdminApi,
  loginPin,
  openTableOrder,
  resetTables,
  tableCard,
} from "./helpers";

test("waiter → chef → waiter → bill across two devices", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, "1111");
  await expect(waiter).toHaveURL(/\/waiter$/);

  await openTableOrder(waiter, "G3");
  await addFirstVariant(waiter);
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await waiter.waitForURL(/\/waiter$/);

  const chefContext = await browser.newContext();
  const chef = await chefContext.newPage();
  await loginPin(chef, "2222");
  await expect(chef).toHaveURL(/\/chef$/);

  const ticket = chef.locator("article").filter({ hasText: "G3" }).first();
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  await ticket.getByRole("button", { name: "Start" }).click();
  await expect(ticket.getByRole("button", { name: "Ready" })).toBeVisible();
  await ticket.getByRole("button", { name: "Ready" }).click();
  await expect(ticket.getByText("Waiting for pickup")).toBeVisible();

  await expect(waiter.getByText("Food ready for pickup")).toBeVisible({ timeout: 20_000 });
  await expect(waiter.getByText(/food is ready/i)).toBeVisible({ timeout: 20_000 });
  await waiter.getByRole("button", { name: "Mark served" }).click();
  await expect(
    tableCard(waiter, "G3").locator("span").getByText("Dining", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  const card = tableCard(waiter, "G3");
  await card.getByText("More actions").click();
  await card.getByRole("button", { name: "Request bill" }).click();
  await expect(card.locator("span").getByText("Bill requested", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await waiterContext.close();
  await chefContext.close();
});

test("offline order is queued and sent exactly once", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, "1111");
  await openTableOrder(waiter, "G5");
  await addFirstVariant(waiter);

  await waiterContext.setOffline(true);
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await waiter.waitForURL(/\/waiter$/);
  await expect(waiter.getByText(/^\d+ orders? queued/)).toBeVisible({ timeout: 10_000 });

  await waiterContext.setOffline(false);
  await expect.poll(() => kitchenTicketsFor(request, "G5"), { timeout: 25_000 }).toBe(1);
  await waiter.waitForTimeout(3_000);
  expect(await kitchenTicketsFor(request, "G5")).toBe(1);

  await waiterContext.close();
});
