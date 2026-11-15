import { prisma } from "./client";
import { notify } from "./notify";

export async function resetRuntimeData(): Promise<Record<string, number>> {
  const counts = await prisma.$transaction(async (tx) => {
    const orderItems = await tx.orderItem.deleteMany();
    const orders = await tx.order.deleteMany();
    const billAdjustments = await tx.billAdjustment.deleteMany();
    const payments = await tx.payment.deleteMany();
    const bills = await tx.bill.deleteMany();
    const tasks = await tx.task.deleteMany();
    const visionEvents = await tx.visionEvent.deleteMany();
    const sessions = await tx.session.deleteMany();
    const auditLogs = await tx.auditLog.deleteMany();
    const tables = await tx.diningTable.updateMany({
      data: { state: "free", visionMutedUntil: null },
    });
    return {
      orderItems: orderItems.count,
      orders: orders.count,
      billAdjustments: billAdjustments.count,
      payments: payments.count,
      bills: bills.count,
      tasks: tasks.count,
      visionEvents: visionEvents.count,
      sessions: sessions.count,
      auditLogs: auditLogs.count,
      tables: tables.count,
    };
  });
  await notify("table.updated", { reason: "runtime-reset" });
  await notify("order.updated", { reason: "runtime-reset" });
  return counts;
}
