import { expect, test } from "@playwright/test";
import { CHEF_PIN, RECEPTIONIST_PIN, WAITER_PIN, addFirstVariant, kitchenTicketsFor, loginAdminApi, loginPin, openTableOrder, resetTables, tableCard } from "./helpers";

test("waiter → chef → waiter → bill across two devices", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, WAITER_PIN);
  await expect(waiter).toHaveURL(/\/waiter$/);

  await openTableOrder(waiter, "G3");
  await addFirstVariant(waiter);
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await waiter.waitForURL(/\/waiter$/);

  const chefContext = await browser.newContext();
  const chef = await chefContext.newPage();
  await loginPin(chef, CHEF_PIN);
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

test("staff cannot free a table with an unpaid order", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, WAITER_PIN);
  await openTableOrder(waiter, "G2");
  await addFirstVariant(waiter);
  const tableId = new URL(waiter.url()).searchParams.get("tableId");
  expect(tableId).toBeTruthy();
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await waiter.waitForURL(/\/waiter$/);

  const waiterFree = await waiter.evaluate(async (id) => {
    const response = await fetch(`/api/tables/${id}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "free" }),
    });
    return response.status;
  }, tableId);
  expect(waiterFree).toBe(409);

  const receptionContext = await browser.newContext();
  const reception = await receptionContext.newPage();
  await loginPin(reception, RECEPTIONIST_PIN);
  await expect(reception).toHaveURL(/\/reception$/);
  const receptionFree = await reception.evaluate(async (id) => {
    const response = await fetch(`/api/tables/${id}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "free" }),
    });
    return response.status;
  }, tableId);
  expect(receptionFree).toBe(409);

  await waiterContext.close();
  await receptionContext.close();
});

test("queued order survives a failed flush while online", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, WAITER_PIN);
  await openTableOrder(waiter, "G4");
  await addFirstVariant(waiter);

  await waiterContext.route("**/api/orders", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "server down" }) }),
  );
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await waiter.waitForURL(/\/waiter$/);
  await expect(waiter.getByText(/^\d+ orders? queued/)).toBeVisible({ timeout: 10_000 });
  await waiter.waitForTimeout(2_000);
  await expect(waiter.getByText(/^\d+ orders? queued/)).toBeVisible();

  await waiterContext.unroute("**/api/orders");
  await waiter.getByRole("button", { name: "Retry now" }).click();
  await expect.poll(() => kitchenTicketsFor(request, "G4"), { timeout: 25_000 }).toBe(1);

  await waiterContext.close();
});

test("401 while queued asks the waiter to sign in and keeps the order", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, WAITER_PIN);
  await openTableOrder(waiter, "G2");
  await addFirstVariant(waiter);

  await waiterContext.route("**/api/orders", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in required" }) }),
  );
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await waiter.waitForURL(/\/waiter$/);
  await expect(waiter.getByText(/sign in again|sign in to send/i)).toBeVisible({ timeout: 10_000 });
  await expect(waiter.getByText(/^\d+ orders? queued/)).toBeVisible();

  await waiterContext.close();
});

test("permanent order rejection moves the order to failed orders", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, WAITER_PIN);
  await openTableOrder(waiter, "G1");
  await addFirstVariant(waiter);

  await waiterContext.route("**/api/orders", (route) =>
    route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Visit is closed" }) }),
  );
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await waiter.waitForURL(/\/waiter$/);
  await expect(waiter.getByText("Failed orders")).toBeVisible({ timeout: 10_000 });
  await expect(waiter.getByText("Visit is closed")).toBeVisible();
  await expect(waiter.getByText(/^\d+ orders? queued/)).toHaveCount(0);

  await waiterContext.close();
});

test("offline order is queued and sent exactly once", async ({ browser, request }) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, WAITER_PIN);
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
