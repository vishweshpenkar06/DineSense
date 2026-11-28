export function isScratchDatabaseUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const name = new URL(url).pathname.replace(/^\//, "").toLowerCase();
    return /(^|[-_])(acceptance|scratch|test)([-_]|$)/.test(name);
  } catch {
    return false;
  }
}

export function assertScratchDatabaseUrl(url: string | undefined | null = process.env.DATABASE_URL): void {
  if (!isScratchDatabaseUrl(url)) {
    throw new Error("Refusing to run a destructive test against a non-scratch database");
  }
}
