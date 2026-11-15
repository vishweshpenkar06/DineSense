import { expect, test } from "@playwright/test";
import {
  addFirstVariant,
  loginAdminApi,
  loginPin,
  openTableOrder,
  resetTables,
} from "./helpers";

test("reception adds extras, discounts, splits payment and prints", async ({
  browser,
  request,
}) => {
  await loginAdminApi(request);
  await resetTables(request);

  const waiterContext = await browser.newContext();
  const waiter = await waiterContext.newPage();
  await loginPin(waiter, "1111");
  await openTableOrder(waiter, "G3");
  await addFirstVariant(waiter);
  await waiter.getByRole("button", { name: "Send to kitchen" }).click();
  await waiter.waitForURL(/\/waiter$/);

  const receptionContext = await browser.newContext();
  const reception = await receptionContext.newPage();
  await loginPin(reception, "3333");
  await expect(reception).toHaveURL(/\/reception$/);

  await reception.getByRole("button", { name: /G3/ }).first().click();
  await expect(reception.locator(".bill-print")).toContainText("DineSense Demo Restaurant");

  await reception.getByPlaceholder("Custom extra").fill("Water");
  await reception.getByPlaceholder("₹", { exact: true }).fill("20");
  await reception.getByRole("button", { name: "Add", exact: true }).click();
  await expect(reception.locator(".bill-print")).toContainText("Water");

  await reception.getByPlaceholder("%").fill("10");
  await reception.getByRole("button", { name: "Add %" }).click();
  await expect(reception.locator(".bill-print")).toContainText("Discount 10%");

  const openResponse = await request.get("/api/bills/open");
  const openData = (await openResponse.json()) as {
    sessions: Array<{ tableLabel: string | null; totalPaise: number }>;
  };
  const total = openData.sessions.find((row) => row.tableLabel === "G3")?.totalPaise ?? 0;
  expect(total).toBeGreaterThan(0);
  const upi = 5000;
  const cash = Math.max(0, total - upi);

  await reception.getByLabel("UPI ₹").fill((upi / 100).toFixed(2));
  await reception.getByLabel("Cash ₹").fill((cash / 100).toFixed(2));
  await reception.getByRole("button", { name: "Take payment & close" }).click();
  await expect(reception.locator(".bill-print")).toContainText("PAID");
  await expect
    .poll(async () => {
      const snapshot = await request.get("/api/snapshot");
      const data = (await snapshot.json()) as {
        tables: Array<{ label: string; state: string }>;
      };
      return data.tables.find((table) => table.label === "G3")?.state;
    })
    .toBe("needs_cleaning");
  await expect
    .poll(async () => {
      const response = await request.get("/api/bills/open");
      const data = (await response.json()) as {
        sessions: Array<{ tableLabel: string | null }>;
      };
      return data.sessions.some((row) => row.tableLabel === "G3");
    })
    .toBe(false);

  await reception.emulateMedia({ media: "print" });
  const width80 = await reception
    .locator(".bill-print")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(width80).toBeLessThan(320);
  await reception.emulateMedia({ media: "screen" });
  await reception.getByLabel("Print format").selectOption("a4");
  await reception.emulateMedia({ media: "print" });
  const widthA4 = await reception
    .locator(".bill-print")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(widthA4).toBeGreaterThan(600);
  await expect(reception.locator(".bill-print")).toContainText("TOTAL");

  await waiterContext.close();
  await receptionContext.close();
});
