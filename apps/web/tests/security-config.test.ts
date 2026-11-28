import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), "..", "..", relative), "utf8");
}

describe("production security configuration", () => {
  it("removes the demo role bypass", () => {
    expect(read("apps/web/src/lib/auth.ts")).not.toContain("DEMO_ALLOW_ALL_ROLES");
  });

  it("does not publish postgres or web directly on all interfaces", () => {
    const compose = read("docker-compose.yml");
    expect(compose).not.toContain('5432:5432');
    expect(compose).not.toContain('3000:3000');
    expect(read("docker-compose.dev.yml")).toContain('3000:3000');
  });

  it("runs web and vision containers as non-root", () => {
    expect(read("Dockerfile")).toMatch(/USER\s+node/);
    expect(read("services/vision/Dockerfile")).toMatch(/USER\s+/);
  });

  it("requires secrets instead of falling back to known values", () => {
    const compose = read("docker-compose.yml");
    for (const name of ["POSTGRES_PASSWORD", "SESSION_SECRET", "ENCRYPTION_KEY", "VISION_SHARED_SECRET"]) {
      expect(compose).toContain(`${name}:?`);
    }
  });

  it("keeps anonymous health output to ok and status", () => {
    const source = read("apps/web/src/app/api/health/route.ts");
    expect(source).toContain("ok");
    expect(source).toContain("status");
    expect(source).toContain("readSessionUser");
  });
});
