import { eventAllowedForRole, type StaffRole } from "@dinesense/core";
import { Client } from "pg";

export type RealtimePayload = { type: string; at: string; [key: string]: unknown };

type Subscriber = {
  role: StaffRole;
  onEvent: (payload: RealtimePayload) => void;
};

type RealtimeGlobals = {
  dsSubs?: Set<Subscriber>;
  dsClient?: Client | null;
  dsRetry?: ReturnType<typeof setTimeout> | null;
};

const globals = globalThis as unknown as RealtimeGlobals;

function subscribers(): Set<Subscriber> {
  globals.dsSubs ??= new Set<Subscriber>();
  return globals.dsSubs;
}

function scheduleReconnect(): void {
  if (globals.dsRetry) return;
  globals.dsRetry = setTimeout(() => {
    globals.dsRetry = null;
    ensureListener();
  }, 2_000);
}

function ensureListener(): void {
  if (globals.dsClient) return;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[realtime] DATABASE_URL is not set; SSE will not receive events");
    return;
  }

  const client = new Client({ connectionString });
  globals.dsClient = client;

  client.on("notification", (message) => {
    if (message.channel !== "dinesense_events" || !message.payload) return;
    let payload: RealtimePayload;
    try {
      payload = JSON.parse(message.payload) as RealtimePayload;
    } catch {
      return;
    }
    for (const subscriber of subscribers()) {
      if (eventAllowedForRole(subscriber.role, payload.type)) {
        try {
          subscriber.onEvent(payload);
        } catch (error) {
          console.error("[realtime] subscriber failed", error);
        }
      }
    }
  });

  const reset = () => {
    globals.dsClient = null;
    scheduleReconnect();
  };

  client.on("error", reset);
  client.on("end", reset);

  client
    .connect()
    .then(() => client.query("LISTEN dinesense_events"))
    .catch((error) => {
      console.error("[realtime] listener connection failed", error);
      globals.dsClient = null;
      scheduleReconnect();
    });
}

export function subscribeRealtime(subscriber: Subscriber): () => void {
  ensureListener();
  subscribers().add(subscriber);
  return () => {
    subscribers().delete(subscriber);
  };
}
