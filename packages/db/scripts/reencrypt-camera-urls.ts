import { decryptSecret, encryptSecret } from "@dinesense/core";
import { prisma } from "../src";

void (async () => {
  const current = process.env.ENCRYPTION_KEY;
  if (!current) throw new Error("ENCRYPTION_KEY is required");
  const legacy = (process.env.OLD_ENCRYPTION_KEYS ?? "dinesense-dev-encryption-key,dev-encryption-key-change-me")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const candidates = [current, ...legacy];
  const cameras = (await prisma.camera.findMany()).filter((camera) => Boolean(camera.rtspUrlEncrypted));
  let reencrypted = 0;
  const failed: string[] = [];

  for (const camera of cameras) {
    const stored = camera.rtspUrlEncrypted!;
    let plain: string | null = null;
    let used = "";
    for (const key of candidates) {
      try {
        plain = decryptSecret(stored, key);
        used = key;
        break;
      } catch {
        continue;
      }
    }
    if (plain === null) {
      failed.push(camera.id);
      continue;
    }
    if (used !== current) {
      await prisma.camera.update({
        where: { id: camera.id },
        data: { rtspUrlEncrypted: encryptSecret(plain, current) },
      });
      reencrypted += 1;
    }
  }

  console.log(`cameras=${cameras.length} reencrypted=${reencrypted} failed=${failed.length}`);
  if (failed.length > 0) console.error(`Undecryptable camera ids: ${failed.join(",")}`);
  await prisma.$disconnect();
  if (failed.length > 0) process.exitCode = 1;
})();
