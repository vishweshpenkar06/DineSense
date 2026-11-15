import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { closeNotifyPool, prisma } from "../src";
import {
  getKitchenTickets,
  getMenuForZone,
  getVisionConfig,
  loadSettings,
  moveSession,
  placeOrder,
  processAbandoned,
  processCameraHealth,
  processDueTimers,
  processTaskAlerts,
  readyOrder,
  recordHeartbeat,
  recordVisionEvent,
  requestBill,
  serveSession,
  setTableStateManually,
  setVariantAvailability,
  setVisionMute,
  startOrder,
  createTakeawaySession,
  cancelOrderItem,
  buildOrderContext,
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

// 10. Camera heartbeat and the 30s offline rule.
await recordHeartbeat({ cameraId: camera.id, status: "ok", fps: 3.1, ts: new Date() });
const heartbeated = await prisma.camera.findUniqueOrThrow({ where: { id: camera.id } });
check("a heartbeat marks the camera OK", heartbeated.status === "OK");
await prisma.camera.update({
  where: { id: camera.id },
  data: { lastHeartbeatAt: new Date(Date.now() - 31_000) },
});
const markedOffline = await processCameraHealth();
check(
  "a camera with no heartbeat for 30s is OFFLINE",
  markedOffline >= 1 &&
    (await prisma.camera.findUniqueOrThrow({ where: { id: camera.id } })).status === "OFFLINE",
  `offline=${markedOffline}`,
);
await recordHeartbeat({ cameraId: camera.id, status: "ok", fps: 3.0, ts: new Date() });
check(
  "a recovery heartbeat restores the camera to OK",
  (await prisma.camera.findUniqueOrThrow({ where: { id: camera.id } })).status === "OK",
);

// 11. Vision config contract.
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

// ---------------------------------------------------------------------------
// Phase 3: menu, kitchen lifecycle, cancellation rules, takeaway and moving.
// ---------------------------------------------------------------------------
const firstZone = await prisma.zone.findFirstOrThrow({ where: { isAc: true } });
const adminUser = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
const waiterUser = await prisma.user.findFirstOrThrow({ where: { role: "WAITER" } });
const receptionUser = await prisma.user.findFirstOrThrow({ where: { role: "RECEPTIONIST" } });
const g4 = await prisma.diningTable.findFirstOrThrow({ where: { label: "G4" } });

const groundMenu = await getMenuForZone(ground.id);
const firstMenu = await getMenuForZone(firstZone.id);
const firstPrices = new Map(
  firstMenu.categories.flatMap((category) =>
    category.items.flatMap((item) =>
      item.variants.map((variant) => [variant.id, variant.pricePaise] as const),
    ),
  ),
);
let priceDifference: string | null = null;
for (const category of groundMenu.categories) {
  for (const item of category.items) {
    for (const variant of item.variants) {
      const other = firstPrices.get(variant.id);
      if (variant.pricePaise !== null && other !== null && other !== undefined && other !== variant.pricePaise) {
        priceDifference = `${variant.label}: grounded ${variant.pricePaise} vs AC ${other}`;
      }
    }
  }
}
check("menu prices differ between ground and AC floors", priceDifference !== null, priceDifference ?? "");

await resetRuntime();
await sim("occupied");
const flowSession = await openSession();
const flowOrder = await orderOnce();
await startOrder(flowOrder.orderId, { id: adminUser.id, role: "ADMIN" });
await readyOrder(flowOrder.orderId, { id: adminUser.id, role: "ADMIN" });
const readyTable = await tableRow();
const readyTask = flowSession
  ? await prisma.task.findFirst({ where: { sessionId: flowSession.id, type: "food_ready" } })
  : null;
check("chef READY moves the table to food_ready", readyTable.state === "food_ready");
check("READY creates a pickup task for the waiter", readyTask?.status === "OPEN");
if (flowSession) {
  await serveSession(flowSession.id, { id: waiterUser.id, role: "WAITER" });
}
const servedTable = await tableRow();
const servedTask = flowSession
  ? await prisma.task.findFirst({ where: { sessionId: flowSession.id, type: "food_ready" } })
  : null;
check("serve moves the table to dining", servedTable.state === "dining");
check("serving completes the pickup task", servedTask?.status === "DONE");

await resetRuntime();
await sim("occupied");
const billOrder = await orderOnce();
const billSession = await openSession();
if (billSession) {
  await requestBill({ sessionId: billSession.id, actorId: waiterUser.id });
}
const billTable = await tableRow();
const billTask = billSession
  ? await prisma.task.findFirst({ where: { sessionId: billSession.id, type: "bill_requested" } })
  : null;
check("requesting the bill flags the table", billTable.state === "bill_requested");
check("requesting the bill creates a task", billTask?.status === "OPEN");

await resetRuntime();
await sim("occupied");
const cancelOrder = await orderOnce();
const cancelItem = await prisma.orderItem.findFirstOrThrow({
  where: { orderId: cancelOrder.orderId },
});
await cancelOrderItem({
  itemId: cancelItem.id,
  actor: { id: waiterUser.id, role: "WAITER" },
});
const cancelled = await prisma.orderItem.findUniqueOrThrow({ where: { id: cancelItem.id } });
check("waiter can cancel an item before cooking starts", cancelled.cancelled);

await resetRuntime();
await sim("occupied");
const fullCancelOrder = await orderOnce();
await startOrder(fullCancelOrder.orderId, { id: adminUser.id, role: "ADMIN" });
const fullCancelItem = await prisma.orderItem.findFirstOrThrow({
  where: { orderId: fullCancelOrder.orderId },
});
let waiterDenied = false;
try {
  await cancelOrderItem({
    itemId: fullCancelItem.id,
    actor: { id: waiterUser.id, role: "WAITER" },
  });
} catch {
  waiterDenied = true;
}
check("waiter cannot cancel after cooking starts", waiterDenied);
await cancelOrderItem({
  itemId: fullCancelItem.id,
  reason: "customer changed their mind",
  actor: { id: receptionUser.id, role: "RECEPTIONIST" },
});
const receptionCancel = await prisma.orderItem.findUniqueOrThrow({
  where: { id: fullCancelItem.id },
});
const cancelledOrder = await prisma.order.findUniqueOrThrow({
  where: { id: fullCancelOrder.orderId },
});
check("reception can cancel after cooking starts with a reason", receptionCancel.cancelled === true);
check("a fully cancelled ticket is marked CANCELLED", cancelledOrder.status === "CANCELLED");

await resetRuntime();
const takeaway = await createTakeawaySession({ actorId: waiterUser.id });
const takeawayOrder = await placeOrder({
  sessionId: takeaway.sessionId,
  items: [{ variantId: variant.id, qty: 1 }],
  clientKey: randomUUID(),
});
const tickets = await getKitchenTickets();
const takeawayTicket = tickets.find((ticket) => ticket.id === takeawayOrder.orderId);
check("takeaway sessions accept orders", takeawayTicket !== undefined);
check("takeaway tickets appear without a table", takeawayTicket?.tableLabel === null);
await startOrder(takeawayOrder.orderId, { id: adminUser.id, role: "ADMIN" });
await readyOrder(takeawayOrder.orderId, { id: adminUser.id, role: "ADMIN" });
const takeawayTask = await prisma.task.findFirst({
  where: { sessionId: takeaway.sessionId, type: "food_ready" },
});
check("takeaway READY creates a pickup task", takeawayTask?.status === "OPEN");
await serveSession(takeaway.sessionId, { id: waiterUser.id, role: "WAITER" });
const takeawayAfter = await prisma.session.findUniqueOrThrow({ where: { id: takeaway.sessionId } });
check("takeaway visits move to dining after pickup", takeawayAfter.state === "dining");
const takeawayContext = await buildOrderContext({ sessionId: takeaway.sessionId });
check("takeaway context resolves the floor menu", takeawayContext.kind === "takeaway" && takeawayContext.menu.categories.length > 0);

await resetRuntime();
await sim("occupied");
const moveOrder = await orderOnce();
const moveSessionRow = await openSession();
if (moveSessionRow) {
  await moveSession({
    sessionId: moveSessionRow.id,
    targetTableId: g4.id,
    actorId: waiterUser.id,
  });
}
const sourceAfterMove = await tableRow();
const targetAfterMove = await prisma.diningTable.findUniqueOrThrow({ where: { id: g4.id } });
const movedSession = moveSessionRow
  ? await prisma.session.findUniqueOrThrow({ where: { id: moveSessionRow.id } })
  : null;
check("moving a visit frees the source table", sourceAfterMove.state === "free");
check("moving a visit occupies the target table", targetAfterMove.state === "ordered");
check("the session points at the new table", movedSession?.tableId === g4.id);
check("the moved kitchen ticket is still open", (await getKitchenTickets()).some((ticket) => ticket.id === moveOrder.orderId));

await setVariantAvailability({ variantId: variant.id, available: false, actorId: adminUser.id });
const outMenu = await getMenuForZone(ground.id);
let hiddenVariant = false;
for (const category of outMenu.categories) {
  for (const item of category.items) {
    for (const candidate of item.variants) {
      if (candidate.id === variant.id && !candidate.available) hiddenVariant = true;
    }
  }
}
check("out-of-stock hides the variant on that floor", hiddenVariant);
await setVariantAvailability({ variantId: variant.id, available: true, actorId: adminUser.id });
const restoredMenu = await getMenuForZone(ground.id);
let restoredVariant = false;
for (const category of restoredMenu.categories) {
  for (const item of category.items) {
    for (const candidate of item.variants) {
      if (candidate.id === variant.id && candidate.available) restoredVariant = true;
    }
  }
}
check("restocking makes the variant orderable again", restoredVariant);

await resetRuntime();
const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) console.log("Failed:", failed.map((f) => f.name).join(", "));

await prisma.$disconnect();
await closeNotifyPool();
process.exit(failed.length > 0 ? 1 : 0);
