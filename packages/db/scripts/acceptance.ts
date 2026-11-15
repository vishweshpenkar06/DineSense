import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { closeNotifyPool, prisma } from "../src";
import {
  getVisionConfig,
  loadSettings,
  placeOrder,
  processAbandoned,
  processDueTimers,
  processTaskAlerts,
  recordVisionEvent,
  setTableStateManually,
  setVisionMute,
  workerLastTick,
  workerTick,
} from "../src";

const dbDir = fileURLToPath(new URL("..", import.meta.url));
const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function check(name: string, pass: boolean, detail = ""): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function approx(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function spawnTimerOnce(): number {
  const out = spawnSync("npx", ["tsx", "scripts/timer-once.ts"], {
    cwd: dbDir,
    encoding: "utf8",
    env: process.env,
    timeout: 90_000,
  });
  if (out.status !== 0) {
    console.error(out.stdout, out.stderr);
    return -1;
  }
  const lines = out.stdout.trim().split("\n").filter(Boolean);
  const last = lines[lines.length - 1] ?? "{}";
  try {
    return (JSON.parse(last) as { fired?: number }).fired ?? -1;
  } catch {
    console.error("Could not parse timer-once output:", out.stdout);
    return -1;
  }
}

async function resetRuntime(): Promise<void> {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.billAdjustment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.task.deleteMany();
  await prisma.visionEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.diningTable.updateMany({ data: { state: "free", visionMutedUntil: null } });
}

const ground = await prisma.zone.findFirst({ where: { isAc: false } });
if (!ground) {
  console.error("No ground-floor zone found. Run `npm run db:seed` first.");
  process.exit(1);
}

const table = await prisma.diningTable.findFirst({
  where: { zoneId: ground.id, label: "G3" },
});
const camera = await prisma.camera.findFirst({ where: { zoneId: ground.id } });
const variant = await prisma.menuVariant.findFirst({
  where: {
    item: { available: true, active: true },
    prices: { some: { zoneId: ground.id, available: true } },
  },
});
if (!table || !camera || !variant) {
  console.error("Seed data incomplete (table G3, camera, menu variant). Run `npm run db:seed`.");
  process.exit(1);
}

const tableId = table.id;
const cameraId = camera.id;
const variantId = variant.id;

async function sim(state: "occupied" | "empty", eventId = randomUUID()): Promise<Date> {
  const ts = new Date();
  await recordVisionEvent({
    cameraId,
    tableId,
    state,
    personCount: state === "occupied" ? 2 : 0,
    confidence: 0.91,
    ts,
    eventId,
  });
  return ts;
}

async function tableRow() {
  return prisma.diningTable.findUniqueOrThrow({ where: { id: tableId } });
}

async function openSession() {
  return prisma.session.findFirst({
    where: { tableId, closedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

async function orderOnce() {
  return placeOrder({
    tableId,
    items: [{ variantId, qty: 2, note: "less spicy" }],
    clientKey: randomUUID(),
  });
}

// 1. Occupied starts the 180s decision timer.
await resetRuntime();
const seatedAt = await sim("occupied");
const firstTable = await tableRow();
const firstSession = await openSession();
check("VISION_OCCUPIED sets the table occupied", firstTable.state === "occupied", firstTable.state);
check("a visit session is opened", firstSession !== null);
check(
  "decision deadline is 180s after seated",
  firstSession?.decisionDeadline !== null &&
    firstSession?.decisionDeadline !== undefined &&
    approx(firstSession.decisionDeadline.getTime(), seatedAt.getTime() + 180_000, 2_000),
  firstSession?.decisionDeadline?.toISOString() ?? "none",
);
check(
  "no waiting-to-order task exists before the deadline",
  firstSession !== null &&
    (await prisma.task.count({ where: { sessionId: firstSession.id, type: "needs_order" } })) === 0,
);

// 2. A fresh worker process fires the overdue timer exactly once (restart-safe).
if (firstSession) {
  await prisma.session.update({
    where: { id: firstSession.id },
    data: { decisionDeadline: new Date(Date.now() - 1_000) },
  });
  const firedFirst = spawnTimerOnce();
  check("a fresh worker process fires the overdue timer", firedFirst === 1, `fired=${firedFirst}`);
  check("table moves to needs_order", (await tableRow()).state === "needs_order");
  check(
    "exactly one needs_order task was created",
    (await prisma.task.count({ where: { sessionId: firstSession.id, type: "needs_order" } })) === 1,
  );
  const firedSecond = spawnTimerOnce();
  check(
    "restarting again creates no duplicates",
    firedSecond === 0 &&
      (await prisma.task.count({ where: { sessionId: firstSession.id, type: "needs_order" } })) === 1,
    `fired=${firedSecond}`,
  );
}

// 3. An order before the deadline cancels the timer for good.
await resetRuntime();
await sim("occupied");
const beforeOrder = await openSession();
const placed = await orderOnce();
if (beforeOrder) {
  await prisma.session.update({
    where: { id: beforeOrder.id },
    data: { decisionDeadline: new Date(Date.now() - 1_000) },
  });
}
await processDueTimers();
const afterOrderSession = await prisma.session.findUniqueOrThrow({
  where: { id: beforeOrder?.id ?? "" },
});
check("order placed at ~100s moves the table to ordered", (await tableRow()).state === "ordered");
check(
  "no needs_order task is ever created after an order",
  (await prisma.task.count({ where: { sessionId: beforeOrder?.id ?? "", type: "needs_order" } })) === 0,
);
check("first order timestamp is recorded", afterOrderSession.firstOrderAt !== null);
check("KOT number is assigned", placed.kotNumber >= 1, `KOT ${placed.kotNumber}`);

// 4. Duplicate vision events are idempotent.
await resetRuntime();
const sharedEventId = randomUUID();
await sim("occupied", sharedEventId);
const duplicate = await recordVisionEvent({
  cameraId: camera.id,
  tableId: table.id,
  state: "occupied",
  personCount: 2,
  confidence: 0.9,
  ts: new Date(),
  eventId: sharedEventId,
});
check("the same event_id is treated as a duplicate", duplicate.duplicate === true);
check(
  "only one vision event row is stored",
  (await prisma.visionEvent.count({ where: { eventId: sharedEventId } })) === 1,
);
check(
  "only one session is opened",
  (await prisma.session.count({ where: { tableId: table.id } })) === 1,
);

// 5. Camera empty never frees a table with an unpaid, ordered visit.
await resetRuntime();
await sim("occupied");
await orderOnce();
await sim("empty");
check("VISION_EMPTY leaves an ordered table untouched", (await tableRow()).state === "ordered");
const unpaidSession = await openSession();
check("the unpaid session stays open", unpaidSession !== null);
if (unpaidSession) {
  await prisma.session.update({
    where: { id: unpaidSession.id },
    data: { emptyAt: new Date(Date.now() - 61_000) },
  });
}
const abandonedOrdered = await processAbandoned();
check(
  "abandon job never closes a visit that ordered",
  abandonedOrdered === 0 && (await openSession()) !== null,
  `closed=${abandonedOrdered}`,
);

// 6. An unordered party that leaves is closed as abandoned after EMPTY_CONFIRM_S.
await resetRuntime();
await sim("occupied");
let unordered = await openSession();
if (unordered) {
  await prisma.session.update({
    where: { id: unordered.id },
    data: { decisionDeadline: new Date(Date.now() - 1_000) },
  });
}
await processDueTimers();
check(
  "waiting-to-order task exists before the party leaves",
  unordered !== null && (await prisma.task.count({ where: { sessionId: unordered.id, type: "needs_order" } })) === 1,
);
await sim("empty");
unordered = await openSession();
check("empty detection is recorded on the session", unordered?.emptyAt !== null);
const beforeWindow = await processAbandoned();
check("abandon waits for EMPTY_CONFIRM_S", beforeWindow === 0, `closed=${beforeWindow}`);
if (unordered) {
  await prisma.session.update({
    where: { id: unordered.id },
    data: { emptyAt: new Date(Date.now() - 61_000) },
  });
}
const abandonedUnordered = await processAbandoned();
check("unordered empty party is closed as abandoned", abandonedUnordered === 1, `closed=${abandonedUnordered}`);
check("table returns to free", (await tableRow()).state === "free");
const closed = unordered ? await prisma.session.findUnique({ where: { id: unordered.id } }) : null;
check("close reason is ABANDONED", closed?.closeReason === "ABANDONED");
check(
  "its open tasks are cancelled",
  (await prisma.task.count({
    where: { sessionId: unordered?.id ?? "", status: { in: ["OPEN", "ACK", "SNOOZED"] } },
  })) === 0,
);

// 7. Vision mute suppresses detection until it expires.
await resetRuntime();
await setVisionMute({ tableId: table.id, mutedUntil: new Date(Date.now() + 300_000) });
await sim("occupied");
check("a muted table ignores camera events", (await tableRow()).state === "free");
await setVisionMute({ tableId: table.id, mutedUntil: null });
await sim("occupied");
check("an unmuted table resumes detection", (await tableRow()).state === "occupied");

// 8. Manual override works and is audited.
await resetRuntime();
await setTableStateManually({ tableId: table.id, target: "dining" });
check("manual override sets the table state", (await tableRow()).state === "dining");
check(
  "manual override is written to the audit log",
  (await prisma.auditLog.count({ where: { entityId: table.id, action: "table.manual_set" } })) >= 1,
);

// 9. Alert escalation and repeat alerts.
await resetRuntime();
await sim("occupied");
const alertSession = await openSession();
if (alertSession) {
  await prisma.session.update({
    where: { id: alertSession.id },
    data: { decisionDeadline: new Date(Date.now() - 1_000) },
  });
}
await processDueTimers();
const alertTask = alertSession
  ? await prisma.task.findFirst({ where: { sessionId: alertSession.id, type: "needs_order" } })
  : null;
if (alertTask) {
  await prisma.task.update({
    where: { id: alertTask.id },
    data: {
      createdAt: new Date(Date.now() - 121_000),
      lastAlertAt: new Date(Date.now() - 61_000),
    },
  });
}
const alerts = await processTaskAlerts();
const escalated = alertTask ? await prisma.task.findUnique({ where: { id: alertTask.id } }) : null;
check("unacknowledged task escalates after 120s", escalated?.escalatedAt !== null);
check("repeat alert fires after 60s", alerts.realerted === 1, `realerted=${alerts.realerted}`);

// 10. Vision config contract.
const config = await getVisionConfig();
const tableCount = config.cameras.reduce((total, cam) => total + cam.tables.length, 0);
check("vision config lists all 11 tables", tableCount === 11, `tables=${tableCount}`);
check(
  "every table has a polygon",
  config.cameras.every((cam) => cam.tables.every((t) => t.polygon.length >= 3)),
);
check(
  "RTSP URLs are decrypted for the vision service",
  config.cameras.every((cam) => cam.rtsp_url.startsWith("rtsp://")),
);

// 11. Worker heartbeat.
await workerTick();
check("worker heartbeat is written to settings", (await workerLastTick()) !== null);

const settings = await loadSettings();
check("DECIDE_WINDOW_S is still the required 180s", settings.DECIDE_WINDOW_S === 180);

await resetRuntime();
const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) console.log("Failed:", failed.map((f) => f.name).join(", "));

await prisma.$disconnect();
await closeNotifyPool();
process.exit(failed.length > 0 ? 1 : 0);
