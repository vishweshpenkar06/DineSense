import { closeNotifyPool, prisma, workerTick } from "@dinesense/db";

const configuredInterval = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
const intervalMs =
  Number.isFinite(configuredInterval) && configuredInterval > 0 ? configuredInterval : 5000;
let stopping = false;

async function shutdown(): Promise<void> {
  await prisma.$disconnect();
  await closeNotifyPool();
}

async function main(): Promise<void> {
  if (process.env.WORKER_ONCE === "true") {
    await workerTick();
    await shutdown();
    return;
  }

  console.log(`[worker] started; tick every ${intervalMs}ms`);
  while (!stopping) {
    const startedAt = Date.now();
    try {
      await workerTick();
    } catch (error) {
      console.error("[worker] tick failed", error);
    }
    const elapsed = Date.now() - startedAt;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, intervalMs - elapsed)));
  }

  console.log("[worker] stopping");
  await shutdown();
}

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

await main();
