const FALLBACK_ENCRYPTION_KEY = "dinesense-dev-encryption-key";

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function encryptionKeySource(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set in production");
  }
  return FALLBACK_ENCRYPTION_KEY;
}

export function visionSharedSecret(): string | null {
  return process.env.VISION_SHARED_SECRET ?? null;
}

export function devConsoleEnabled(): boolean {
  return process.env.ENABLE_DEV_CONSOLE === "true";
}
