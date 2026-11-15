import { closeNotifyPool, prisma } from "../src";
import { processDueTimers } from "../src/jobs";

const fired = await processDueTimers();
console.log(JSON.stringify({ fired }));
await prisma.$disconnect();
await closeNotifyPool();
