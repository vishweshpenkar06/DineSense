import { prisma } from "../src";

const bills = await prisma.bill.findMany({
  where: { status: "PAID" },
  include: { payments: true },
  orderBy: { paidAt: "asc" },
});

const overpaid = bills
  .map((bill) => ({
    billNumber: bill.billNumber,
    totalPaise: bill.total,
    paidPaise: bill.payments.reduce((sum, payment) => sum + payment.amountPaise, 0),
    tenderedPaise: bill.payments.reduce(
      (sum, payment) => sum + (payment.tenderedPaise ?? payment.amountPaise),
      0,
    ),
  }))
  .filter((row) => row.paidPaise > row.totalPaise);

console.log(`Paid bills with payments above total: ${overpaid.length}`);
for (const row of overpaid) {
  console.log(
    `${row.billNumber}: total=${row.totalPaise} applied=${row.paidPaise} tendered=${row.tenderedPaise}`,
  );
}
await prisma.$disconnect();
