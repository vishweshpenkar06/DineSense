import { Pool } from "pg";
import { databaseUrl } from "./config";

export const NOTIFY_CHANNEL = "dinesense_events";

const globalForPg = globalThis as unknown as { dinesensePool?: Pool };

function pool(): Pool {
  if (!globalForPg.dinesensePool) {
    globalForPg.dinesensePool = new Pool({ connectionString: databaseUrl(), max: 2 });
  }
  return globalForPg.dinesensePool;
}

export type RealtimePayload = {
  type: string;
  at: string;
  [key: string]: unknown;
};

export async function notify(type: string, payload: Record<string, unknown> = {}): Promise<void> {
  const body: RealtimePayload = { type, at: new Date().toISOString(), ...payload };
  try {
    await pool().query("SELECT pg_notify($1, $2)", [NOTIFY_CHANNEL, JSON.stringify(body)]);
  } catch (error) {
    console.error("[realtime] notify failed", type, error);
  }
}

export async function closeNotifyPool(): Promise<void> {
  if (globalForPg.dinesensePool) {
    await globalForPg.dinesensePool.end();
    globalForPg.dinesensePool = undefined;
  }
}
