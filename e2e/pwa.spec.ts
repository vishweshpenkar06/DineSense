import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

test("manifest, icons and service worker are available", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const body = (await manifest.json()) as { display: string; icons: unknown[] };
  expect(body.display).toBe("standalone");
  expect(body.icons.length).toBeGreaterThanOrEqual(3);

  for (const icon of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"]) {
    const response = await request.get(icon);
    expect(response.ok()).toBeTruthy();
  }

  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(scope).toContain("127.0.0.1");
});
