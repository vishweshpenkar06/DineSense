import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiDir = path.join(process.cwd(), "src", "app", "api");

const unauthenticatedAllowlist = new Set([
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/me/route.ts",
  "health/route.ts",
  "vision/config/route.ts",
  "vision/events/route.ts",
  "vision/heartbeat/route.ts",
]);

function routeFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...routeFiles(full));
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}

describe("API authentication coverage", () => {
  it("every API route has an auth guard or an explicit allowlist entry", () => {
    const unguarded: string[] = [];
    for (const file of routeFiles(apiDir)) {
      const relative = path.relative(apiDir, file).replace(/\\/g, "/");
      if (unauthenticatedAllowlist.has(relative)) continue;
      const source = fs.readFileSync(file, "utf8");
      if (!source.includes("requireRole") && !source.includes("assertVisionSecret")) {
        unguarded.push(relative);
      }
    }
    expect(unguarded).toEqual([]);
  });
});
