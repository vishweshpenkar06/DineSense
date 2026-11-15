import { expect, type APIRequestContext, type Page } from "@playwright/test";

export async function loginPin(page: Page, pin: string): Promise<void> {
  await page.goto("/login");
  for (const digit of pin) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function loginAdminApi(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/login", { data: { password: "admin123" } });
  expect(response.ok()).toBeTruthy();
}

export async function resetTables(request: APIRequestContext): Promise<void> {
  const response = await request.get("/api/snapshot");
  expect(response.ok()).toBeTruthy();
  const snapshot = (await response.json()) as {
    tables: Array<{ id: string }>;
  };
  for (const table of snapshot.tables) {
    await request.post(`/api/tables/${table.id}/state`, { data: { state: "free" } });
  }
}

export function tableCard(page: Page, label: string) {
  return page.locator("article").filter({ hasText: label }).first();
}

export async function openTableOrder(page: Page, label: string): Promise<void> {
  const card = tableCard(page, label);
  await expect(card).toBeVisible();
  const seat = card.getByRole("button", { name: "Seat table" });
  if (await seat.isVisible().catch(() => false)) {
    await seat.click();
    await expect(card.getByRole("link", { name: "Order" })).toBeVisible();
  }
  await card.getByRole("link", { name: "Order" }).click();
  await page.waitForURL(/\/waiter\/order/);
}

export async function addFirstVariant(page: Page): Promise<void> {
  const variant = page.getByRole("button", { name: /Half/ }).first();
  await variant.click();
  await expect(page.getByText("Cart · 1 items")).toBeVisible();
}

export async function kitchenTicketsFor(
  request: APIRequestContext,
  label: string,
): Promise<number> {
  const response = await request.get("/api/kitchen/tickets");
  if (!response.ok()) return -1;
  const data = (await response.json()) as {
    tickets: Array<{ tableLabel: string | null; status: string }>;
  };
  return data.tickets.filter(
    (ticket) => ticket.tableLabel === label && ticket.status !== "CANCELLED",
  ).length;
}
