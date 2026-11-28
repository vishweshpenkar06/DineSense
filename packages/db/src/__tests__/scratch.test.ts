import { describe, expect, it } from "vitest";
import { isScratchDatabaseUrl } from "../scratch";

describe("isScratchDatabaseUrl", () => {
  it("accepts explicitly scratch databases", () => {
    expect(isScratchDatabaseUrl("postgresql://u:p@localhost:5432/dinesense_acceptance?schema=public")).toBe(true);
    expect(isScratchDatabaseUrl("postgresql://u:p@localhost:5432/dinesense_scratch?schema=public")).toBe(true);
    expect(isScratchDatabaseUrl("postgresql://u:p@localhost:5432/dinesense_test?schema=public")).toBe(true);
  });

  it("rejects the live database and ambiguous names", () => {
    expect(isScratchDatabaseUrl("postgresql://u:p@localhost:5432/dinesense?schema=public")).toBe(false);
    expect(isScratchDatabaseUrl("postgresql://u:p@localhost:5432/postgres?schema=public")).toBe(false);
    expect(isScratchDatabaseUrl("")).toBe(false);
  });
});
