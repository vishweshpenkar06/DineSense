import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  businessDateString,
  businessDayStartFromDate,
  decryptSecret,
  shiftBusinessDate,
  verifySecret,
  type MenuImportGroup,
} from "@dinesense/core";
import { closeNotifyPool, prisma } from "../src";
import {
  addBillAdjustment,
  createCamera,
  createStaff,
  createTable,
  createZone,
  deleteCategory,
  deleteItem,
  deleteCamera,
  deleteTable,
  deleteZone,
  encryptionKeySource,
  getAdminCameras,
  getAdminFloors,
  getAdminMenu,
  getBillView,
  getDayClose,
  getCameraCalibration,
  getKitchenTickets,
  getMenuForZone,
  getRecentDetections,
  getOpenBills,
  getReportCsv,
  getReportSummary,
  importMenuGroups,
  payBill,
  removeBillAdjustment,
  reopenBill,
  voidBill,
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
  setTableZone,
  startOrder,
  updateAdminSettings,
  updateCamera,
  updateStaff,
  updateTable,
  createTakeawaySession,
  cancelOrderItem,
  buildOrderContext,
  completeSetup,
  getPilotReview,
  getSetupStatus,
  reopenSetup,
  runSetupDemo,
  saveDayClose,
  savePilotNotes,
  workerLastTick,
  workerTick,
} from "../src";
import { assertScratchDatabaseUrl } from "../src/scratch";

assertScratchDatabaseUrl();

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

// 1. Occupied starts the 120s decision timer.
await resetRuntime();
const seatedAt = await sim("occupied");
const firstTable = await tableRow();
const firstSession = await openSession();
check("VISION_OCCUPIED sets the table occupied", firstTable.state === "occupied", firstTable.state);
check("a visit session is opened", firstSession !== null);
check(
  "decision deadline is 120s after seated",
  firstSession?.decisionDeadline !== null &&
    firstSession?.decisionDeadline !== undefined &&
    approx(firstSession.decisionDeadline.getTime(), seatedAt.getTime() + 120_000, 2_000),
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

const concurrentKey = randomUUID();
const concurrent = await Promise.allSettled([
  placeOrder({ tableId, items: [{ variantId, qty: 1 }], clientKey: concurrentKey }),
  placeOrder({ tableId, items: [{ variantId, qty: 1 }], clientKey: concurrentKey }),
]);
check(
  "two concurrent orders with one clientKey both succeed",
  concurrent.every((entry) => entry.status === "fulfilled"),
  concurrent.map((entry) => entry.status).join(","),
);
check(
  "concurrent duplicate returns the same order",
  concurrent[0].status === "fulfilled" &&
    concurrent[1].status === "fulfilled" &&
    concurrent[0].value.orderId === concurrent[1].value.orderId,
);
check(
  "only one order row exists for the concurrent clientKey",
  (await prisma.order.count({ where: { clientKey: concurrentKey } })) === 1,
);

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
check("DECIDE_WINDOW_S is still the required 120s", settings.DECIDE_WINDOW_S === 120);

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

// ---------------------------------------------------------------------------
// Phase 4: hand-calculated bills, tax, split payments, void and reopen.
// ---------------------------------------------------------------------------
const halfNoodles = await prisma.menuVariant.findFirstOrThrow({
  where: {
    item: { name: "Veg Hakka Noodles" },
    label: "Half",
    prices: { some: { zoneId: ground.id } },
  },
  include: { prices: { where: { zoneId: ground.id } } },
});
const groundHalfPrice = halfNoodles.prices[0]?.pricePaise ?? 9000;

async function setTax(rate: number, mode: "exclusive" | "inclusive") {
  await prisma.setting.upsert({
    where: { key: "TAX_RATE_PERCENT" },
    create: { key: "TAX_RATE_PERCENT", value: rate },
    update: { value: rate },
  });
  await prisma.setting.upsert({
    where: { key: "TAX_MODE" },
    create: { key: "TAX_MODE", value: mode },
    update: { value: mode },
  });
}

await setTax(5, "exclusive");
await resetRuntime();
await sim("occupied");
const paidOrder = await placeOrder({
  tableId: tableId,
  items: [{ variantId: halfNoodles.id, qty: 2 }],
  clientKey: randomUUID(),
});
const paidSession = await openSession();
if (!paidSession) throw new Error("billing test session missing");

const opened = await getBillView(paidSession.id);
check("opening a bill allocates a sequential bill number", /^DS-\d{4}-\d{6}$/.test(opened.bill?.billNumber ?? ""), opened.bill?.billNumber ?? "none");
check(
  "subtotal uses the snapshotted order price",
  opened.draft.subtotalPaise === 2 * groundHalfPrice,
  `subtotal=${opened.draft.subtotalPaise}`,
);

await addBillAdjustment({
  sessionId: paidSession.id,
  kind: "EXTRA",
  label: "Packaged Water",
  amountPaise: 2000,
  actorId: receptionUser.id,
});
await addBillAdjustment({
  sessionId: paidSession.id,
  kind: "EXTRA",
  label: "Packaged Water",
  amountPaise: 2000,
  actorId: receptionUser.id,
});
const removable = await addBillAdjustment({
  sessionId: paidSession.id,
  kind: "EXTRA",
  label: "Temporary extra",
  amountPaise: 5000,
  actorId: receptionUser.id,
});
const removableId = removable.bill?.adjustments.find((adjustment) => adjustment.label === "Temporary extra")?.id;
if (removableId) {
  await removeBillAdjustment({ sessionId: paidSession.id, adjustmentId: removableId, actorId: receptionUser.id });
}
const discounted = await addBillAdjustment({
  sessionId: paidSession.id,
  kind: "DISCOUNT",
  percent: 10,
  actorId: receptionUser.id,
});
check("extras and the removed extra are correct", discounted.draft.extrasPaise === 4000, `extras=${discounted.draft.extrasPaise}`);

const expectedSubtotal = 2 * groundHalfPrice;
const expectedDiscount = Math.round(expectedSubtotal * 0.1);
const expectedBase = expectedSubtotal + 4000 - expectedDiscount;
const expectedTax = Math.round(expectedBase * 0.05);
const expectedUnrounded = expectedBase + expectedTax;
const expectedTotal = Math.round(expectedUnrounded / 100) * 100;
const expectedRoundOff = expectedTotal - expectedUnrounded;
check(
  "hand-calculated bill matches to the paisa",
  discounted.draft.subtotalPaise === expectedSubtotal &&
    discounted.draft.discountPaise === expectedDiscount &&
    discounted.draft.taxableAmountPaise === expectedBase &&
    discounted.draft.taxPaise === expectedTax &&
    discounted.draft.cgstPaise === Math.floor(expectedTax / 2) &&
    discounted.draft.sgstPaise === expectedTax - Math.floor(expectedTax / 2) &&
    discounted.draft.roundOffPaise === expectedRoundOff &&
    discounted.draft.totalPaise === expectedTotal,
  `subtotal=${discounted.draft.subtotalPaise} discount=${discounted.draft.discountPaise} tax=${discounted.draft.taxPaise} total=${discounted.draft.totalPaise}`,
);
check(
  "10% discount and 5% exclusive tax match the example",
  expectedSubtotal === 18000 &&
    expectedDiscount === 1800 &&
    expectedTax === 1010 &&
    expectedTotal === 21200 &&
    expectedRoundOff === -10,
  `${expectedSubtotal}/${expectedDiscount}/${expectedTax}/${expectedTotal}/${expectedRoundOff}`,
);

const cashPart = 11200;
const upiPart = expectedTotal - cashPart;
const paid = await payBill({
  sessionId: paidSession.id,
  payments: [
    { method: "CASH", amountPaise: cashPart },
    { method: "UPI", amountPaise: upiPart },
  ],
  actorId: receptionUser.id,
});
const paidTable = await tableRow();
const closedPaid = await prisma.session.findUniqueOrThrow({ where: { id: paidSession.id } });
const cleanTask = await prisma.task.findFirst({ where: { sessionId: paidSession.id, type: "clean_table" } });
check("split cash/UPI payments mark the bill paid", paid.bill.bill?.status === "PAID" && paid.changePaise === 0);
check("paying closes the visit with reason PAID", closedPaid.closeReason === "PAID" && closedPaid.closedAt !== null);
check("paying moves the table to needs_cleaning", paidTable.state === "needs_cleaning");
check("paying creates the cleaning task", cleanTask?.status === "OPEN");
check("paid visits leave the open-bills list", !(await getOpenBills()).some((row) => row.sessionId === paidSession.id));
check("payments are recorded separately", paid.bill.bill?.payments.length === 2);

await resetRuntime();
await sim("occupied");
const voidOrder = await placeOrder({
  tableId: tableId,
  items: [{ variantId: halfNoodles.id, qty: 1 }],
  clientKey: randomUUID(),
});
const voidSession = await openSession();
if (!voidSession) throw new Error("void test session missing");
const voidView = await getBillView(voidSession.id);
const voidNumber = voidView.bill?.billNumber;
await voidBill({ sessionId: voidSession.id, reason: "wrong table", actorId: receptionUser.id });
const voidedBill = await prisma.bill.findFirstOrThrow({ where: { sessionId: voidSession.id } });
const voidedSession = await prisma.session.findUniqueOrThrow({ where: { id: voidSession.id } });
const voidedTable = await tableRow();
check("voiding keeps the bill number", voidedBill.status === "VOID" && voidedBill.billNumber === voidNumber);
check("voiding closes the visit and frees the table", voidedSession.closeReason === "VOID" && voidedTable.state === "free");

await resetRuntime();
await sim("occupied");
const reopenOrder = await placeOrder({
  tableId: tableId,
  items: [{ variantId: halfNoodles.id, qty: 1 }],
  clientKey: randomUUID(),
});
const reopenSession = await openSession();
if (!reopenSession) throw new Error("reopen test session missing");
const reopenOpened = await getBillView(reopenSession.id);
const reopenTotal = reopenOpened.draft.totalPaise;
const paidBeforeReopen = await payBill({
  sessionId: reopenSession.id,
  payments: [{ method: "CARD", amountPaise: reopenTotal }],
  actorId: receptionUser.id,
});
check("card-only payment works", paidBeforeReopen.bill.bill?.status === "PAID");
const reopened = await reopenBill({
  sessionId: reopenSession.id,
  reason: "wrong payment mode",
  actorId: adminUser.id,
});
const reopenedSession = await prisma.session.findUniqueOrThrow({ where: { id: reopenSession.id } });
const reopenedTable = await tableRow();
check("admin can reopen a paid bill", reopened.bill?.status === "OPEN");
check("reopening reverses the payments", (reopened.bill?.payments.length ?? 0) === 0);
check("reopening reopens the visit", reopenedSession.closedAt === null && reopenedSession.closeReason === null);
check("reopening puts the table back to bill_requested", reopenedTable.state === "bill_requested");

await setTax(5, "inclusive");
await resetRuntime();
const f2 = await prisma.diningTable.findFirstOrThrow({ where: { label: "F2" } });
await setTableStateManually({ tableId: f2.id, target: "occupied", actorId: waiterUser.id });
const f2Session = await prisma.session.findFirstOrThrow({ where: { tableId: f2.id, closedAt: null } });
await placeOrder({
  tableId: f2.id,
  items: [{ variantId: halfNoodles.id, qty: 4 }],
  clientKey: randomUUID(),
});
const inclusiveView = await getBillView(f2Session.id);
check(
  "inclusive tax keeps the total and extracts the tax",
  inclusiveView.taxInclusive &&
    inclusiveView.draft.totalPaise === 40000 &&
    inclusiveView.draft.taxableAmountPaise === 38095 &&
    inclusiveView.draft.taxPaise === 1905 &&
    inclusiveView.draft.cgstPaise === 952 &&
    inclusiveView.draft.sgstPaise === 953,
  `taxable=${inclusiveView.draft.taxableAmountPaise} tax=${inclusiveView.draft.taxPaise} total=${inclusiveView.draft.totalPaise}`,
);
check("AC floor prices are used for the inclusive bill", inclusiveView.draft.subtotalPaise === 40000, `subtotal=${inclusiveView.draft.subtotalPaise}`);

await setTax(5, "exclusive");
await updateAdminSettings({
  settings: { SERVICE_CHARGE_PERCENT: 10 },
  actorId: adminUser.id,
});
await resetRuntime();
await sim("occupied");
await placeOrder({
  tableId: tableId,
  items: [{ variantId: halfNoodles.id, qty: 2 }],
  clientKey: randomUUID(),
});
const serviceSession = await openSession();
if (!serviceSession) throw new Error("service-charge test session missing");
const serviceView = await getBillView(serviceSession.id);
check(
  "service charge is added before GST and shown in the breakup",
  serviceView.draft.subtotalPaise === 18000 &&
    serviceView.draft.serviceChargePaise === 1800 &&
    serviceView.draft.taxPaise === 990 &&
    serviceView.draft.totalPaise === 20800 &&
    serviceView.draft.taxBreakup?.[0]?.ratePercent === 5 &&
    serviceView.draft.taxBreakup?.[0]?.taxablePaise === 19800,
  `subtotal=${serviceView.draft.subtotalPaise} service=${serviceView.draft.serviceChargePaise} tax=${serviceView.draft.taxPaise} total=${serviceView.draft.totalPaise}`,
);
await updateAdminSettings({
  settings: { SERVICE_CHARGE_PERCENT: 0 },
  actorId: adminUser.id,
});
await setTax(0, "exclusive");

// ---------------------------------------------------------------------------
// Phase 5: reports, admin settings, floors/tables, staff and menu import.
// ---------------------------------------------------------------------------
await resetRuntime();
await sim("occupied");
const reportOrder = await placeOrder({
  tableId: tableId,
  items: [{ variantId: halfNoodles.id, qty: 2 }],
  clientKey: randomUUID(),
});
const reportSession = await openSession();
if (!reportSession) throw new Error("report test session missing");
const reportBill = await getBillView(reportSession.id);
const reportTotal = reportBill.draft.totalPaise;
await payBill({
  sessionId: reportSession.id,
  payments: [{ method: "CASH", amountPaise: reportTotal }],
  actorId: receptionUser.id,
});

const activeSettings = await loadSettings();
const today = businessDateString(new Date(), activeSettings.BUSINESS_DAY_START);
const dayClose = await getDayClose();
check(
  "day close totals the cash taken today",
  dayClose.businessDay === today && dayClose.expectedCashPaise === reportTotal,
  `day=${dayClose.businessDay} cash=${dayClose.expectedCashPaise} expected=${reportTotal}`,
);
const savedClose = await saveDayClose({
  businessDay: today,
  countedCashPaise: dayClose.expectedCashPaise,
  note: "acceptance drawer count",
  actorId: adminUser.id,
});
check(
  "day close saves a zero cash variance",
  savedClose.variancePaise === 0 && savedClose.closedAt !== null && savedClose.countedCashPaise === reportTotal,
  `variance=${savedClose.variancePaise}`,
);
const yesterday = shiftBusinessDate(today, -1);
const summary = await getReportSummary({ from: today, to: today });
const rawBills = await prisma.bill.findMany({
  where: { status: "PAID" },
  select: { total: true, billNumber: true },
});
const rawItemSum = await prisma.orderItem.aggregate({
  where: { order: { sessionId: reportSession.id }, cancelled: false },
  _sum: { qty: true },
});
const rawItems = rawItemSum._sum.qty ?? 0;
check(
  "report earnings match the raw paid bills",
  summary.earningsPaise === rawBills.reduce((sum, bill) => sum + bill.total, 0),
  `report=${summary.earningsPaise} raw=${rawBills.reduce((sum, bill) => sum + bill.total, 0)}`,
);
check(
  "report counts match raw bills/orders/items",
  summary.billsCount === rawBills.length &&
    summary.ordersCount === 1 &&
    summary.itemsCount === rawItems &&
    summary.itemsCount === 2,
  `bills=${summary.billsCount} orders=${summary.ordersCount} items=${summary.itemsCount}`,
);
check(
  "report floor and payment breakdowns match",
  summary.byFloor.length === 1 &&
    summary.byFloor[0]?.zoneName === "Ground Floor" &&
    summary.byFloor[0]?.earningsPaise === reportTotal &&
    summary.byPayment[0]?.method === "CASH" &&
    summary.byPayment[0]?.amountPaise === reportTotal,
  `${summary.byFloor.map((row) => row.zoneName).join(",")} / ${summary.byPayment.map((row) => row.method).join(",")}`,
);
check(
  "report top dishes include the ordered item",
  summary.topDishes.some((dish) => dish.name === "Veg Hakka Noodles" && dish.qty === 2),
);
const csv = await getReportCsv({ from: today, to: today });
check(
  "CSV export contains the bill number and item",
  csv.csv.includes(reportBill.bill?.billNumber ?? "missing") && csv.csv.includes("Veg Hakka Noodles"),
);

const lateNight = new Date(
  businessDayStartFromDate(today, activeSettings.BUSINESS_DAY_START).getTime() - 3 * 60 * 60 * 1000,
);
await prisma.bill.update({ where: { sessionId: reportSession.id }, data: { paidAt: lateNight } });
const todayAfterLate = await getReportSummary({ from: today, to: today });
const yesterdayAfterLate = await getReportSummary({ from: yesterday, to: yesterday });
check(
  "a 02:00 IST bill belongs to the previous business day",
  todayAfterLate.billsCount === 0 && yesterdayAfterLate.billsCount === 1,
  `today=${todayAfterLate.billsCount} yesterday=${yesterdayAfterLate.billsCount}`,
);
await resetRuntime();

const settingsResult = await updateAdminSettings({
  settings: { DECIDE_WINDOW_S: 240, TAX_RATE_PERCENT: 5, TAX_MODE: "exclusive" },
  actorId: adminUser.id,
});
check(
  "admin settings update timers and tax",
  settingsResult.DECIDE_WINDOW_S === 240 && settingsResult.TAX_RATE_PERCENT === 5,
);
let invalidSettingRejected = false;
try {
  await updateAdminSettings({ settings: { DECIDE_WINDOW_S: 1 }, actorId: adminUser.id });
} catch {
  invalidSettingRejected = true;
}
check("admin rejects an invalid timer value", invalidSettingRejected);
await updateAdminSettings({
  settings: { DECIDE_WINDOW_S: 120, TAX_RATE_PERCENT: 0, TAX_MODE: "exclusive" },
  actorId: adminUser.id,
});
check("settings were restored for the rest of the suite", (await loadSettings()).DECIDE_WINDOW_S === 120);

const adminZone = await createZone({ name: "Acceptance Floor", actorId: adminUser.id });
const adminTable = await createTable({
  zoneId: adminZone.id,
  label: "T1",
  seats: 2,
  actorId: adminUser.id,
});
await updateTable({ id: adminTable.id, seats: 6, actorId: adminUser.id });
const floorsAfterCreate = await getAdminFloors();
const createdZone = floorsAfterCreate.zones.find((zone) => zone.id === adminZone.id);
check(
  "admin can create and edit a floor and table",
  createdZone?.tables[0]?.label === "T1" && createdZone.tables[0]?.seats === 6,
);
await deleteTable({ id: adminTable.id, actorId: adminUser.id });
await deleteZone({ id: adminZone.id, actorId: adminUser.id });
const floorsAfterDelete = await getAdminFloors();
check(
  "admin can delete an empty floor and table",
  !floorsAfterDelete.zones.some((zone) => zone.id === adminZone.id),
);

const createdStaff = await createStaff({
  name: "Acceptance Waiter",
  role: "WAITER",
  pin: "9876",
  actorId: adminUser.id,
});
let staffRow = await prisma.user.findUniqueOrThrow({ where: { id: createdStaff.id } });
check("admin can create staff with a PIN", verifySecret("9876", staffRow.pinHash));
await updateStaff({ id: createdStaff.id, pin: "6543", actorId: adminUser.id });
staffRow = await prisma.user.findUniqueOrThrow({ where: { id: createdStaff.id } });
check(
  "admin can reset a staff PIN",
  verifySecret("6543", staffRow.pinHash) && !verifySecret("9876", staffRow.pinHash),
);
let badPinRejected = false;
try {
  await createStaff({ name: "Bad PIN", role: "WAITER", pin: "12", actorId: adminUser.id });
} catch {
  badPinRejected = true;
}
check("admin rejects an invalid staff PIN", badPinRejected);
let selfDeactivateRejected = false;
try {
  await updateStaff({ id: adminUser.id, active: false, actorId: adminUser.id });
} catch {
  selfDeactivateRejected = true;
}
check("admin cannot deactivate their own account", selfDeactivateRejected);
await updateStaff({ id: createdStaff.id, active: false, actorId: adminUser.id });
check(
  "admin can deactivate staff",
  (await prisma.user.findUniqueOrThrow({ where: { id: createdStaff.id } })).active === false,
);
await prisma.user.delete({ where: { id: createdStaff.id } });

const importGroup: MenuImportGroup = {
  category: "Acceptance Import",
  item: "Test Momo",
  localName: null,
  isVeg: true,
  needsKitchen: true,
  variants: [
    { label: "Half", prices: { groundPaise: 5000, firstPaise: 6000 } },
    { label: "Full", prices: { groundPaise: 9000, firstPaise: null } },
  ],
};
const imported = await importMenuGroups({ groups: [importGroup], actorId: adminUser.id });
const importedMenu = await getMenuForZone(ground.id);
const importedCategory = importedMenu.categories.find((entry) => entry.name === "Acceptance Import");
const importedItem = importedCategory?.items.find((entry) => entry.name === "Test Momo");
check("menu import creates the item", importedItem !== undefined && imported.variants === 2);
const groundHalf = importedItem?.variants.find((variant) => variant.label === "Half");
check(
  "menu import sets both floor prices",
  groundHalf?.pricePaise === 5000,
  `ground=${groundHalf?.pricePaise ?? "none"}`,
);
const firstFloorMenu = await getMenuForZone(firstZone.id);
const firstItem = firstFloorMenu.categories
  .find((entry) => entry.name === "Acceptance Import")
  ?.items.find((entry) => entry.name === "Test Momo");
const firstHalfPrice = firstItem?.variants.find((variant) => variant.label === "Half");
const firstFullPrice = firstItem?.variants.find((variant) => variant.label === "Full");
check(
  "menu import keeps the AC price and flags a missing one",
  firstHalfPrice?.pricePaise === 6000 && firstFullPrice?.available === false,
);
const adminMenu = await getAdminMenu();
const importedAdminCategory = adminMenu.categories.find((entry) => entry.name === "Acceptance Import");
const importedAdminItem = importedAdminCategory?.items.find((entry) => entry.name === "Test Momo");
if (importedAdminItem) {
  await deleteItem({ id: importedAdminItem.id, actorId: adminUser.id });
}
if (importedAdminCategory) {
  await deleteCategory({ id: importedAdminCategory.id, actorId: adminUser.id });
}
check(
  "admin can delete an imported item and category",
  !(await getAdminMenu()).categories.some((entry) => entry.name === "Acceptance Import"),
);

// ---------------------------------------------------------------------------
// Phase 6: camera credentials, active filtering, calibration and detections.
// ---------------------------------------------------------------------------
await resetRuntime();
const cameraUrl = "rtsp://acceptance:secret@10.0.0.99:554/stream";
const testCamera = await createCamera({
  name: "Acceptance Camera",
  zoneId: ground.id,
  rtspUrl: cameraUrl,
  actorId: adminUser.id,
});
const cameraRow = await prisma.camera.findUniqueOrThrow({ where: { id: testCamera.id } });
check(
  "camera RTSP credentials are encrypted at rest",
  cameraRow.rtspUrlEncrypted !== cameraUrl &&
    decryptSecret(cameraRow.rtspUrlEncrypted, encryptionKeySource()) === cameraUrl,
);
const cameraDto = (await getAdminCameras()).find((camera) => camera.id === testCamera.id);
check(
  "the admin camera API never returns the RTSP URL",
  cameraDto !== undefined &&
    !Object.prototype.hasOwnProperty.call(cameraDto, "rtspUrl") &&
    cameraDto.hasRtsp &&
    cameraDto.active,
);
check(
  "active cameras are published to the vision service",
  (await getVisionConfig()).cameras.some((camera) => camera.id === testCamera.id),
);
await updateCamera({ id: testCamera.id, active: false, actorId: adminUser.id });
check(
  "disabled cameras disappear from the vision config",
  !(await getVisionConfig()).cameras.some((camera) => camera.id === testCamera.id),
);
await updateCamera({ id: testCamera.id, active: true, actorId: adminUser.id });

const calibrationTable = await createTable({
  zoneId: ground.id,
  label: "CAL1",
  seats: 2,
  cameraId: testCamera.id,
  actorId: adminUser.id,
});
const polygon = [
  [0.1, 0.1],
  [0.4, 0.1],
  [0.4, 0.4],
  [0.1, 0.4],
];
await setTableZone({
  tableId: calibrationTable.id,
  cameraId: testCamera.id,
  polygon,
  actorId: adminUser.id,
});
const calibration = await getCameraCalibration(testCamera.id);
const calibratedTable = calibration.tables.find((table) => table.id === calibrationTable.id);
check(
  "calibration saves normalized table polygons",
  calibratedTable?.polygon?.length === 4 &&
    calibratedTable.polygon[0]?.[0] === 0.1 &&
    calibratedTable.cameraId === testCamera.id,
);
const visionAfterCalibration = await getVisionConfig();
const calibratedConfigCamera = visionAfterCalibration.cameras.find(
  (camera) => camera.id === testCamera.id,
);
check(
  "the vision config receives the calibrated polygon",
  calibratedConfigCamera?.tables.find((table) => table.id === calibrationTable.id)?.polygon.length === 4,
);

await sim("occupied");
const recentDetections = await getRecentDetections({ limit: 5 });
check(
  "recent detections are queryable for review",
  recentDetections.length > 0 && recentDetections.some((event) => event.tableLabel === "G3"),
  `events=${recentDetections.length}`,
);

await resetRuntime();
await deleteTable({ id: calibrationTable.id, actorId: adminUser.id });
await deleteCamera({ id: testCamera.id, actorId: adminUser.id });
check(
  "test camera and table were cleaned up",
  (await prisma.camera.findUnique({ where: { id: testCamera.id } })) === null,
);

// ---------------------------------------------------------------------------
// Phase 7: first-run setup, guided test run and completion state.
// ---------------------------------------------------------------------------
await resetRuntime();
const setupBefore = await getSetupStatus();
check(
  "setup status reports counts for the owner",
  setupBefore.counts.zones > 0 &&
    setupBefore.counts.tables > 0 &&
    setupBefore.counts.categories > 0,
  `zones=${setupBefore.counts.zones} tables=${setupBefore.counts.tables}`,
);
await reopenSetup(adminUser.id);
check("setup can be reopened for the wizard", (await getSetupStatus()).complete === false);
const billsBeforeDemo = await prisma.bill.count();
const demo = await runSetupDemo(adminUser.id);
check(
  "guided test run walks seat → alert → order → ready → paid → cleanup",
  demo.steps.length >= 7 &&
    demo.steps.some((step) => step.label === "Timer fired") &&
    demo.steps.some((step) => step.label === "Bill paid") &&
    demo.steps.some((step) => step.label === "Test data cleaned"),
  `steps=${demo.steps.length}`,
);
const demoTables = await prisma.diningTable.findMany({ where: { label: demo.tableLabel } });
const demoOpen = await prisma.session.count({
  where: { tableId: { in: demoTables.map((table) => table.id) }, closedAt: null },
});
check(
  "the guided test cleans up its order, bill and session",
  (await prisma.bill.count()) === billsBeforeDemo &&
    demoOpen === 0 &&
    demoTables.every((table) => table.state === "free"),
);
await completeSetup(adminUser.id);
check("setup completes and persists", (await getSetupStatus()).complete === true);

// ---------------------------------------------------------------------------
// Phase 8: shadow mode and the daily pilot accuracy review.
// ---------------------------------------------------------------------------
await updateAdminSettings({ settings: { SHADOW_MODE: true }, actorId: adminUser.id });
check("shadow mode can be enabled", (await loadSettings()).SHADOW_MODE === true);

await resetRuntime();
await sim("empty");
await setTableStateManually({ tableId, target: "occupied", actorId: adminUser.id });
const pilotSettings = await loadSettings();
const pilotDate = businessDateString(new Date(), pilotSettings.BUSINESS_DAY_START);
const pilot = await getPilotReview({ date: pilotDate });
check(
  "daily review counts manual corrections and camera events",
  pilot.summary.overrides >= 1 && pilot.summary.cameraEvents >= 1,
  `overrides=${pilot.summary.overrides} events=${pilot.summary.cameraEvents}`,
);
check(
  "a manual seat after an empty detection is flagged as a mismatch",
  pilot.summary.mismatches >= 1 &&
    pilot.overrides.some(
      (override) =>
        override.tableLabel === "G3" &&
        override.visionState === "empty" &&
        override.toState === "occupied" &&
        override.mismatch,
    ),
  `mismatches=${pilot.summary.mismatches}`,
);
await savePilotNotes({ date: pilotDate, note: "Pilot acceptance note", actorId: adminUser.id });
check(
  "the daily pilot note is saved",
  (await getPilotReview({ date: pilotDate })).notes === "Pilot acceptance note",
);
await updateAdminSettings({ settings: { SHADOW_MODE: false }, actorId: adminUser.id });
check("shadow mode can be disabled", (await loadSettings()).SHADOW_MODE === false);
await prisma.setting.deleteMany({ where: { key: `PILOT_NOTE_${pilotDate}` } });

await resetRuntime();
const failed = results.filter((result) => !result.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) console.log("Failed:", failed.map((f) => f.name).join(", "));

await prisma.$disconnect();
await closeNotifyPool();
process.exit(failed.length > 0 ? 1 : 0);
