import { mergeSettings, type Settings } from "@dinesense/core";
import { prisma } from "./client";

export async function loadSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany({ select: { key: true, value: true } });
  const raw: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.key.startsWith("_")) continue;
    raw[row.key] = row.value;
  }
  return mergeSettings(raw);
}

export async function readInternalSetting<T = unknown>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : null;
}

export async function writeInternalSetting(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as never },
    update: { value: value as never },
  });
}

export async function workerLastTick(): Promise<Date | null> {
  const value = await readInternalSetting<{ at?: string }>("_worker_last_tick");
  if (!value?.at) return null;
  const date = new Date(value.at);
  return Number.isNaN(date.getTime()) ? null : date;
}
