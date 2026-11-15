import { randomBytes } from "node:crypto";
import { DEFAULT_SETTINGS, encryptSecret, hashSecret } from "@dinesense/core";
import { prisma } from "../src/client";
import { encryptionKeySource } from "../src/config";

type SeedVariant = { label: string; ground: number; first: number };
type SeedItem = {
  name: string;
  local?: string;
  veg: boolean;
  needsKitchen: boolean;
  variants: SeedVariant[];
};

const MENU: Array<{ category: string; items: SeedItem[] }> = [
  {
    category: "Noodles",
    items: [
      {
        name: "Veg Hakka Noodles",
        local: "वेज हक्का नूडल्स",
        veg: true,
        needsKitchen: true,
        variants: [
          { label: "Half", ground: 9000, first: 10000 },
          { label: "Full", ground: 15000, first: 17000 },
        ],
      },
      {
        name: "Chicken Hakka Noodles",
        local: "चिकन हक्का नूडल्स",
        veg: false,
        needsKitchen: true,
        variants: [
          { label: "Half", ground: 11000, first: 12500 },
          { label: "Full", ground: 18000, first: 20000 },
        ],
      },
    ],
  },
  {
    category: "Rice",
    items: [
      {
        name: "Schezwan Fried Rice",
        local: "शेज़वान फ्राइड राइस",
        veg: true,
        needsKitchen: true,
        variants: [
          { label: "Half", ground: 10000, first: 11000 },
          { label: "Full", ground: 16000, first: 18000 },
        ],
      },
    ],
  },
  {
    category: "Starters",
    items: [
      {
        name: "Veg Manchurian",
        local: "वेज मंचूरियन",
        veg: true,
        needsKitchen: true,
        variants: [
          { label: "Half Dry", ground: 10000, first: 11000 },
          { label: "Full Dry", ground: 17000, first: 19000 },
          { label: "Half Gravy", ground: 10500, first: 11500 },
          { label: "Full Gravy", ground: 17500, first: 19500 },
        ],
      },
      {
        name: "Paneer Chilli",
        local: "पनीर चिल्ली",
        veg: true,
        needsKitchen: true,
        variants: [
          { label: "Half", ground: 14000, first: 16000 },
          { label: "Full", ground: 24000, first: 27000 },
        ],
      },
      {
        name: "Chicken Lollipop",
        local: "चिकन लॉलीपॉप",
        veg: false,
        needsKitchen: true,
        variants: [
          { label: "Half", ground: 13000, first: 15000 },
          { label: "Full", ground: 23000, first: 26000 },
        ],
      },
    ],
  },
  {
    category: "Soups",
    items: [
      {
        name: "Hot & Sour Soup",
        local: "हॉट एंड सॉर सूप",
        veg: true,
        needsKitchen: true,
        variants: [{ label: "Regular", ground: 7000, first: 8000 }],
      },
    ],
  },
  {
    category: "Beverages",
    items: [
      {
        name: "Packaged Water",
        local: "पानी बोतल",
        veg: true,
        needsKitchen: false,
        variants: [{ label: "500 ml", ground: 2000, first: 2000 }],
      },
      {
        name: "Cold Drink",
        local: "कोल्ड ड्रिंक",
        veg: true,
        needsKitchen: false,
        variants: [
          { label: "250 ml", ground: 3000, first: 3500 },
          { label: "600 ml", ground: 5000, first: 5500 },
        ],
      },
    ],
  },
];

function polygonFor(index: number): number[][] {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const x0 = 0.05 + col * 0.31;
  const y0 = 0.08 + row * 0.42;
  return [
    [x0, y0],
    [x0 + 0.28, y0],
    [x0 + 0.28, y0 + 0.36],
    [x0, y0 + 0.36],
  ];
}

async function wipe(): Promise<void> {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.billAdjustment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.task.deleteMany();
  await prisma.visionEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.variantZonePrice.deleteMany();
  await prisma.menuVariant.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();
  await prisma.diningTable.deleteMany();
  await prisma.camera.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.restaurantProfile.deleteMany();
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force") || process.env.SEED_FORCE === "true";
  const minimal = process.argv.includes("--minimal");
  const userCount = await prisma.user.count();
  if (userCount > 0 && !force) {
    console.log("Seed skipped: database already has users. Re-run with --force to reset.");
    return;
  }
  if (force) await wipe();

  if (minimal) {
    await prisma.restaurantProfile.create({
      data: {
        id: "default",
        name: "My Restaurant",
        address: "Complete the setup wizard to set your address",
      },
    });
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await prisma.setting.create({ data: { key, value } });
    }
    await prisma.setting.create({ data: { key: "SETUP_COMPLETE", value: false } });
    const adminPassword =
      process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    await prisma.user.create({
      data: { name: "Owner", role: "ADMIN", passwordHash: hashSecret(adminPassword) },
    });
    console.log("Minimal install seeded (no demo data).");
    console.log("  admin username: Owner (password login only)");
    console.log("  admin password:", adminPassword);
    console.log("  Open /login, sign in as admin, and complete /setup.");
    return;
  }

  await prisma.restaurantProfile.create({
    data: {
      id: "default",
      name: "DineSense Demo Restaurant",
      address: "12 Market Road, Indore, Madhya Pradesh 452001",
      phone: "+91 90000 00000",
      billFooter: "Thank you, visit again!",
    },
  });

  const ground = await prisma.zone.create({
    data: { name: "Ground Floor", isAc: false, sort: 0 },
  });
  const first = await prisma.zone.create({
    data: { name: "First Floor", isAc: true, sort: 1 },
  });

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.create({ data: { key, value } });
  }
  await prisma.setting.create({ data: { key: "SETUP_COMPLETE", value: true } });

  const groundCamera = await prisma.camera.create({
    data: {
      name: "Ground Camera",
      zoneId: ground.id,
      rtspUrlEncrypted: encryptSecret(
        "rtsp://demo:demo@127.0.0.1:8554/ground",
        encryptionKeySource(),
      ),
    },
  });
  const firstCamera = await prisma.camera.create({
    data: {
      name: "First Floor Camera",
      zoneId: first.id,
      rtspUrlEncrypted: encryptSecret(
        "rtsp://demo:demo@127.0.0.1:8554/first",
        encryptionKeySource(),
      ),
    },
  });

  const groundLabels = ["G1", "G2", "G3", "G4", "G5"];
  for (const [index, label] of groundLabels.entries()) {
    await prisma.diningTable.create({
      data: {
        zoneId: ground.id,
        label,
        seats: 4,
        cameraId: groundCamera.id,
        zonePolygon: polygonFor(index),
      },
    });
  }

  const firstLabels = ["F1", "F2", "F3", "F4", "F5", "F6"];
  for (const [index, label] of firstLabels.entries()) {
    await prisma.diningTable.create({
      data: {
        zoneId: first.id,
        label,
        seats: 4,
        cameraId: firstCamera.id,
        zonePolygon: polygonFor(index),
      },
    });
  }

  for (const [sort, group] of MENU.entries()) {
    const category = await prisma.category.create({
      data: { name: group.category, sort },
    });

    for (const [itemSort, item] of group.items.entries()) {
      await prisma.menuItem.create({
        data: {
          categoryId: category.id,
          name: item.name,
          nameLocal: item.local ?? null,
          isVeg: item.veg,
          needsKitchen: item.needsKitchen,
          sort: itemSort,
          variants: {
            create: item.variants.map((variant) => ({
              label: variant.label,
              prices: {
                create: [
                  { zoneId: ground.id, pricePaise: variant.ground },
                  { zoneId: first.id, pricePaise: variant.first },
                ],
              },
            })),
          },
        },
      });
    }
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  await prisma.user.createMany({
    data: [
      { name: "Owner", role: "ADMIN", passwordHash: hashSecret(adminPassword) },
      { name: "Waiter", role: "WAITER", pinHash: hashSecret("1111") },
      { name: "Chef", role: "CHEF", pinHash: hashSecret("2222") },
      { name: "Receptionist", role: "RECEPTIONIST", pinHash: hashSecret("3333") },
    ],
  });

  console.log("Seeded DineSense demo data:");
  console.log("  zones: Ground Floor (non-AC), First Floor (AC)");
  console.log("  11 tables: G1-G5, F1-F6");
  console.log("  2 cameras,", MENU.length, "categories, demo menu");
  console.log("  login: admin / " + adminPassword + " | waiter PIN 1111 | chef PIN 2222 | receptionist PIN 3333");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
