import {
  encryptSecret,
  hashSecret,
  type AdminCameraDto,
  type AdminCategoryDto,
  type CameraCalibrationDto,
  type CameraCalibrationTableDto,
  type AdminFloorsDto,
  type AdminItemDto,
  type AdminMenuDto,
  type AdminSettingsDto,
  type AdminStaffDto,
  type AdminZoneDto,
  type MenuImportGroup,
  type Settings,
  type StaffRole,
  type TuningResponseDto,
  type VisionDetectionDto,
} from "@dinesense/core";
import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { encryptionKeySource } from "./config";
import { ConflictError, DomainError, NotFoundError } from "./errors";
import { notify } from "./notify";
import { loadSettings } from "./settings";

type Tx = Prisma.TransactionClient;

async function audit(
  tx: Tx,
  actorId: string | null | undefined,
  action: string,
  entity: string,
  entityId: string,
  detail?: unknown,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actorId ?? null,
      action,
      entity,
      entityId,
      detail: (detail ?? {}) as Prisma.InputJsonValue,
    },
  });
}

function required(value: string | undefined | null, field: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new DomainError(`${field} is required`);
  return trimmed;
}

export async function getAdminMenu(): Promise<AdminMenuDto> {
  const [zones, categories] = await Promise.all([
    prisma.zone.findMany({ orderBy: { sort: "asc" } }),
    prisma.category.findMany({
      orderBy: [{ sort: "asc" }, { name: "asc" }],
      include: {
        items: {
          orderBy: [{ sort: "asc" }, { name: "asc" }],
          include: {
            variants: {
              orderBy: { createdAt: "asc" },
              include: { prices: true },
            },
          },
        },
      },
    }),
  ]);

  return {
    zones: zones.map((zone): AdminZoneDto => ({
      id: zone.id,
      name: zone.name,
      isAc: zone.isAc,
      surchargeType: zone.surchargeType,
      surchargeValue: zone.surchargeValue,
      sort: zone.sort,
    })),
    categories: categories.map((category): AdminCategoryDto => ({
      id: category.id,
      name: category.name,
      sort: category.sort,
      items: category.items.map((item): AdminItemDto => ({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        nameLocal: item.nameLocal,
        isVeg: item.isVeg,
        needsKitchen: item.needsKitchen,
        available: item.available,
        active: item.active,
        sort: item.sort,
        variants: item.variants.map((variant) => ({
          id: variant.id,
          label: variant.label,
          prices: variant.prices.map((price) => ({
            zoneId: price.zoneId,
            pricePaise: price.pricePaise,
            available: price.available,
          })),
        })),
      })),
    })),
  };
}

export async function createCategory(input: {
  name: string;
  sort?: number;
  actorId?: string | null;
}): Promise<{ id: string }> {
  const name = required(input.name, "Category name");
  const created = await prisma.$transaction(async (tx) => {
    const count = await tx.category.count();
    const category = await tx.category.create({
      data: { name, sort: input.sort ?? count },
    });
    await audit(tx, input.actorId, "menu.category_created", "category", category.id, { name });
    return category;
  });
  await notify("menu.availability", { categoryId: created.id });
  return { id: created.id };
}

export async function updateCategory(input: {
  id: string;
  name?: string;
  sort?: number;
  actorId?: string | null;
}): Promise<void> {
  const category = await prisma.category.findUnique({ where: { id: input.id } });
  if (!category) throw new NotFoundError("category");
  const name = input.name !== undefined ? required(input.name, "Category name") : undefined;
  await prisma.$transaction(async (tx) => {
    await tx.category.update({
      where: { id: input.id },
      data: { name, sort: input.sort },
    });
    await audit(tx, input.actorId, "menu.category_updated", "category", input.id, {
      name,
      sort: input.sort,
    });
  });
  await notify("menu.availability", { categoryId: input.id });
}

export async function deleteCategory(input: {
  id: string;
  actorId?: string | null;
}): Promise<void> {
  const category = await prisma.category.findUnique({
    where: { id: input.id },
    include: { _count: { select: { items: true } } },
  });
  if (!category) throw new NotFoundError("category");
  if (category._count.items > 0) {
    throw new ConflictError("Move or delete the items in this category first");
  }
  await prisma.$transaction(async (tx) => {
    await tx.category.delete({ where: { id: input.id } });
    await audit(tx, input.actorId, "menu.category_deleted", "category", input.id, {
      name: category.name,
    });
  });
  await notify("menu.availability", { categoryId: input.id });
}

export async function createItem(input: {
  categoryId: string;
  name: string;
  nameLocal?: string | null;
  isVeg?: boolean;
  needsKitchen?: boolean;
  available?: boolean;
  sort?: number;
  actorId?: string | null;
}): Promise<{ id: string }> {
  const name = required(input.name, "Item name");
  const created = await prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new NotFoundError("category");
    const count = await tx.menuItem.count({ where: { categoryId: input.categoryId } });
    const item = await tx.menuItem.create({
      data: {
        categoryId: input.categoryId,
        name,
        nameLocal: input.nameLocal?.trim() || null,
        isVeg: input.isVeg ?? true,
        needsKitchen: input.needsKitchen ?? true,
        available: input.available ?? true,
        sort: input.sort ?? count,
      },
    });
    await audit(tx, input.actorId, "menu.item_created", "menu_item", item.id, { name });
    return item;
  });
  await notify("menu.availability", { itemId: created.id });
  return { id: created.id };
}

export async function updateItem(input: {
  id: string;
  name?: string;
  nameLocal?: string | null;
  isVeg?: boolean;
  needsKitchen?: boolean;
  available?: boolean;
  active?: boolean;
  sort?: number;
  actorId?: string | null;
}): Promise<void> {
  const item = await prisma.menuItem.findUnique({ where: { id: input.id } });
  if (!item) throw new NotFoundError("menu item");
  const name = input.name !== undefined ? required(input.name, "Item name") : undefined;
  await prisma.$transaction(async (tx) => {
    await tx.menuItem.update({
      where: { id: input.id },
      data: {
        name,
        nameLocal: input.nameLocal !== undefined ? input.nameLocal?.trim() || null : undefined,
        isVeg: input.isVeg,
        needsKitchen: input.needsKitchen,
        available: input.available,
        active: input.active,
        sort: input.sort,
      },
    });
    await audit(tx, input.actorId, "menu.item_updated", "menu_item", input.id, {
      name,
      available: input.available,
      active: input.active,
    });
  });
  await notify("menu.availability", { itemId: input.id });
}

export async function deleteItem(input: {
  id: string;
  actorId?: string | null;
}): Promise<{ softDeleted: boolean }> {
  const item = await prisma.menuItem.findUnique({
    where: { id: input.id },
    include: { variants: { select: { id: true } } },
  });
  if (!item) throw new NotFoundError("menu item");

  const used = await prisma.orderItem.count({
    where: { variantId: { in: item.variants.map((variant) => variant.id) } },
  });

  await prisma.$transaction(async (tx) => {
    if (used > 0) {
      await tx.menuItem.update({
        where: { id: input.id },
        data: { active: false, available: false },
      });
    } else {
      await tx.variantZonePrice.deleteMany({
        where: { variant: { itemId: input.id } },
      });
      await tx.menuVariant.deleteMany({ where: { itemId: input.id } });
      await tx.menuItem.delete({ where: { id: input.id } });
    }
    await audit(tx, input.actorId, used > 0 ? "menu.item_archived" : "menu.item_deleted", "menu_item", input.id, {
      name: item.name,
      used,
    });
  });
  await notify("menu.availability", { itemId: input.id });
  return { softDeleted: used > 0 };
}

export async function createVariant(input: {
  itemId: string;
  label: string;
  actorId?: string | null;
}): Promise<{ id: string }> {
  const label = required(input.label, "Variant label");
  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new NotFoundError("menu item");
    const variant = await tx.menuVariant.create({
      data: { itemId: input.itemId, label },
    });
    await audit(tx, input.actorId, "menu.variant_created", "menu_variant", variant.id, {
      itemId: input.itemId,
      label,
    });
    return variant;
  });
  await notify("menu.availability", { itemId: input.itemId });
  return { id: created.id };
}

export async function updateVariant(input: {
  id: string;
  label?: string;
  actorId?: string | null;
}): Promise<void> {
  const variant = await prisma.menuVariant.findUnique({ where: { id: input.id } });
  if (!variant) throw new NotFoundError("menu variant");
  const label = input.label !== undefined ? required(input.label, "Variant label") : undefined;
  await prisma.$transaction(async (tx) => {
    await tx.menuVariant.update({ where: { id: input.id }, data: { label } });
    await audit(tx, input.actorId, "menu.variant_updated", "menu_variant", input.id, { label });
  });
  await notify("menu.availability", { itemId: variant.itemId });
}

export async function deleteVariant(input: {
  id: string;
  actorId?: string | null;
}): Promise<void> {
  const variant = await prisma.menuVariant.findUnique({ where: { id: input.id } });
  if (!variant) throw new NotFoundError("menu variant");
  const used = await prisma.orderItem.count({ where: { variantId: input.id } });
  if (used > 0) {
    throw new ConflictError("This variant is used by orders; make it unavailable instead");
  }
  await prisma.$transaction(async (tx) => {
    await tx.variantZonePrice.deleteMany({ where: { variantId: input.id } });
    await tx.menuVariant.delete({ where: { id: input.id } });
    await audit(tx, input.actorId, "menu.variant_deleted", "menu_variant", input.id, {
      itemId: variant.itemId,
      label: variant.label,
    });
  });
  await notify("menu.availability", { itemId: variant.itemId });
}

export async function setVariantPrices(input: {
  variantId: string;
  prices: Array<{ zoneId: string; pricePaise: number; available: boolean }>;
  actorId?: string | null;
}): Promise<void> {
  if (input.prices.length === 0) throw new DomainError("Provide at least one zone price");
  const variant = await prisma.menuVariant.findUnique({
    where: { id: input.variantId },
    include: { item: { select: { name: true } } },
  });
  if (!variant) throw new NotFoundError("menu variant");

  for (const price of input.prices) {
    if (!Number.isInteger(price.pricePaise) || price.pricePaise < 0) {
      throw new DomainError("Prices must be zero or positive paise");
    }
  }
  const zoneCount = await prisma.zone.count({
    where: { id: { in: input.prices.map((price) => price.zoneId) } },
  });
  if (zoneCount !== new Set(input.prices.map((price) => price.zoneId)).size) {
    throw new NotFoundError("zone");
  }

  await prisma.$transaction(async (tx) => {
    for (const price of input.prices) {
      await tx.variantZonePrice.upsert({
        where: { variantId_zoneId: { variantId: input.variantId, zoneId: price.zoneId } },
        create: {
          variantId: input.variantId,
          zoneId: price.zoneId,
          pricePaise: price.pricePaise,
          available: price.available,
        },
        update: { pricePaise: price.pricePaise, available: price.available },
      });
    }
    await audit(tx, input.actorId, "menu.prices_updated", "menu_variant", input.variantId, {
      item: variant.item.name,
      variant: variant.label,
      prices: input.prices,
    });
  });
  await notify("menu.availability", { variantId: input.variantId });
}

export async function importMenuGroups(input: {
  groups: MenuImportGroup[];
  actorId?: string | null;
}): Promise<{ categories: number; items: number; variants: number; prices: number }> {
  if (input.groups.length === 0) throw new DomainError("No importable rows");
  for (const group of input.groups) {
    if (!group.category?.trim() || !group.item?.trim()) {
      throw new DomainError("Every imported item needs a category and a name");
    }
    if (group.variants.length === 0) {
      throw new DomainError(`${group.item} has no variants`);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const zones = await tx.zone.findMany({ orderBy: { sort: "asc" } });
    const ground = zones.find((zone) => !zone.isAc);
    const first = zones.find((zone) => zone.isAc);
    if (!ground && !first) throw new ConflictError("Create a floor before importing a menu");

    let categories = 0;
    let itemsCreated = 0;
    let variants = 0;
    let prices = 0;

    for (const group of input.groups) {
      const categoryName = required(group.category, "Category");
      let category = await tx.category.findFirst({
        where: { name: { equals: categoryName, mode: "insensitive" } },
      });
      if (!category) {
        const count = await tx.category.count();
        category = await tx.category.create({ data: { name: categoryName, sort: count } });
        categories += 1;
      }

      const itemName = required(group.item, "Item");
      let item = await tx.menuItem.findFirst({
        where: {
          categoryId: category.id,
          name: { equals: itemName, mode: "insensitive" },
        },
      });
      if (item) {
        item = await tx.menuItem.update({
          where: { id: item.id },
          data: {
            name: itemName,
            nameLocal: group.localName?.trim() || null,
            isVeg: group.isVeg,
            needsKitchen: group.needsKitchen,
            active: true,
            available: true,
          },
        });
      } else {
        const count = await tx.menuItem.count({ where: { categoryId: category.id } });
        item = await tx.menuItem.create({
          data: {
            categoryId: category.id,
            name: itemName,
            nameLocal: group.localName?.trim() || null,
            isVeg: group.isVeg,
            needsKitchen: group.needsKitchen,
            sort: count,
          },
        });
        itemsCreated += 1;
      }

      for (const variantGroup of group.variants) {
        const label = required(variantGroup.label, "Variant");
        let variant = await tx.menuVariant.findFirst({
          where: { itemId: item.id, label: { equals: label, mode: "insensitive" } },
        });
        if (!variant) {
          variant = await tx.menuVariant.create({ data: { itemId: item.id, label } });
          variants += 1;
        }

        for (const [zone, price] of [
          [ground, variantGroup.prices.groundPaise],
          [first, variantGroup.prices.firstPaise],
        ] as const) {
          if (!zone) continue;
          if (price === null) {
            const existing = await tx.variantZonePrice.findUnique({
              where: { variantId_zoneId: { variantId: variant.id, zoneId: zone.id } },
            });
            if (existing) {
              await tx.variantZonePrice.update({
                where: { variantId_zoneId: { variantId: variant.id, zoneId: zone.id } },
                data: { available: false },
              });
            } else {
              await tx.variantZonePrice.create({
                data: {
                  variantId: variant.id,
                  zoneId: zone.id,
                  pricePaise: 0,
                  available: false,
                },
              });
            }
          } else {
            await tx.variantZonePrice.upsert({
              where: { variantId_zoneId: { variantId: variant.id, zoneId: zone.id } },
              create: {
                variantId: variant.id,
                zoneId: zone.id,
                pricePaise: price,
                available: true,
              },
              update: { pricePaise: price, available: true },
            });
          }
          prices += 1;
        }
      }
    }

    await audit(tx, input.actorId, "menu.imported", "menu", "import", {
      categories,
      items: itemsCreated,
      variants,
      prices,
    });
    return { categories, items: itemsCreated, variants, prices };
  });

  await notify("menu.availability", { reason: "import" });
  return result;
}

export async function getAdminFloors(): Promise<AdminFloorsDto> {
  const [zones, cameras] = await Promise.all([
    prisma.zone.findMany({
      orderBy: { sort: "asc" },
      include: {
        tables: { orderBy: { label: "asc" } },
      },
    }),
    prisma.camera.findMany({
      where: { active: true },
      select: { id: true, name: true, zoneId: true },
    }),
  ]);
  return {
    zones: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      isAc: zone.isAc,
      surchargeType: zone.surchargeType,
      surchargeValue: zone.surchargeValue,
      sort: zone.sort,
      tables: zone.tables.map((table) => ({
        id: table.id,
        zoneId: table.zoneId,
        label: table.label,
        seats: table.seats,
        cameraId: table.cameraId,
        active: table.active,
        state: table.state,
      })),
    })),
    cameras,
  };
}

function validateSurcharge(type: string, value: number): void {
  if (!["NONE", "FLAT", "PERCENT"].includes(type)) throw new DomainError("Invalid surcharge type");
  if (!Number.isInteger(value) || value < 0) throw new DomainError("Surcharge must be zero or positive");
  if (type === "PERCENT" && value > 100) throw new DomainError("Percent surcharge cannot exceed 100");
}

export async function createZone(input: {
  name: string;
  isAc?: boolean;
  surchargeType?: string;
  surchargeValue?: number;
  sort?: number;
  actorId?: string | null;
}): Promise<{ id: string }> {
  const name = required(input.name, "Floor name");
  const surchargeType = input.surchargeType ?? "NONE";
  const surchargeValue = input.surchargeValue ?? 0;
  validateSurcharge(surchargeType, surchargeValue);
  const created = await prisma.$transaction(async (tx) => {
    const count = await tx.zone.count();
    const zone = await tx.zone.create({
      data: {
        name,
        isAc: input.isAc ?? false,
        surchargeType: surchargeType as "NONE" | "FLAT" | "PERCENT",
        surchargeValue,
        sort: input.sort ?? count,
      },
    });
    await audit(tx, input.actorId, "floor.created", "zone", zone.id, { name });
    return zone;
  });
  return { id: created.id };
}

export async function updateZone(input: {
  id: string;
  name?: string;
  isAc?: boolean;
  surchargeType?: string;
  surchargeValue?: number;
  sort?: number;
  actorId?: string | null;
}): Promise<void> {
  const zone = await prisma.zone.findUnique({ where: { id: input.id } });
  if (!zone) throw new NotFoundError("floor");
  const name = input.name !== undefined ? required(input.name, "Floor name") : undefined;
  const surchargeType = input.surchargeType ?? zone.surchargeType;
  const surchargeValue = input.surchargeValue ?? zone.surchargeValue;
  validateSurcharge(surchargeType, surchargeValue);
  await prisma.$transaction(async (tx) => {
    await tx.zone.update({
      where: { id: input.id },
      data: {
        name,
        isAc: input.isAc,
        surchargeType: surchargeType as "NONE" | "FLAT" | "PERCENT",
        surchargeValue,
        sort: input.sort,
      },
    });
    await audit(tx, input.actorId, "floor.updated", "zone", input.id, { name });
  });
}

export async function deleteZone(input: { id: string; actorId?: string | null }): Promise<void> {
  const zone = await prisma.zone.findUnique({ where: { id: input.id } });
  if (!zone) throw new NotFoundError("floor");
  const [tables, cameras, prices, sessions, tasks] = await Promise.all([
    prisma.diningTable.count({ where: { zoneId: input.id } }),
    prisma.camera.count({ where: { zoneId: input.id } }),
    prisma.variantZonePrice.count({ where: { zoneId: input.id } }),
    prisma.session.count({ where: { zoneId: input.id } }),
    prisma.task.count({ where: { zoneId: input.id } }),
  ]);
  if (tables + cameras + prices + sessions + tasks > 0) {
    throw new ConflictError("This floor still has tables, cameras, prices or visits");
  }
  await prisma.$transaction(async (tx) => {
    await tx.zone.delete({ where: { id: input.id } });
    await audit(tx, input.actorId, "floor.deleted", "zone", input.id, { name: zone.name });
  });
}

export async function createTable(input: {
  zoneId: string;
  label: string;
  seats?: number;
  cameraId?: string | null;
  actorId?: string | null;
}): Promise<{ id: string }> {
  const label = required(input.label, "Table label");
  const seats = input.seats ?? 4;
  if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
    throw new DomainError("Seats must be between 1 and 50");
  }
  const created = await prisma.$transaction(async (tx) => {
    const zone = await tx.zone.findUnique({ where: { id: input.zoneId } });
    if (!zone) throw new NotFoundError("floor");
    if (input.cameraId) {
      const camera = await tx.camera.findUnique({ where: { id: input.cameraId } });
      if (!camera) throw new NotFoundError("camera");
      if (camera.zoneId !== input.zoneId) throw new DomainError("Camera belongs to another floor");
    }
    const table = await tx.diningTable.create({
      data: {
        zoneId: input.zoneId,
        label,
        seats,
        cameraId: input.cameraId ?? null,
      },
    });
    await audit(tx, input.actorId, "table.created", "table", table.id, { label, zone: zone.name });
    return table;
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("A table with that label already exists on this floor");
    }
    throw error;
  });
  return { id: created.id };
}

export async function updateTable(input: {
  id: string;
  label?: string;
  seats?: number;
  cameraId?: string | null;
  active?: boolean;
  actorId?: string | null;
}): Promise<void> {
  const table = await prisma.diningTable.findUnique({ where: { id: input.id } });
  if (!table) throw new NotFoundError("table");
  const label = input.label !== undefined ? required(input.label, "Table label") : undefined;
  if (input.seats !== undefined && (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > 50)) {
    throw new DomainError("Seats must be between 1 and 50");
  }
  if (input.active === false) {
    const open = await prisma.session.count({ where: { tableId: input.id, closedAt: null } });
    if (open > 0) throw new ConflictError("This table has an open visit");
  }
  if (input.cameraId) {
    const camera = await prisma.camera.findUnique({ where: { id: input.cameraId } });
    if (!camera) throw new NotFoundError("camera");
    if (camera.zoneId !== table.zoneId) throw new DomainError("Camera belongs to another floor");
  }
  await prisma.$transaction(async (tx) => {
    await tx.diningTable.update({
      where: { id: input.id },
      data: {
        label,
        seats: input.seats,
        cameraId: input.cameraId,
        active: input.active,
      },
    });
    await audit(tx, input.actorId, "table.updated", "table", input.id, {
      label,
      seats: input.seats,
      active: input.active,
    });
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("A table with that label already exists on this floor");
    }
    throw error;
  });
}

export async function deleteTable(input: {
  id: string;
  actorId?: string | null;
}): Promise<{ softDeleted: boolean }> {
  const table = await prisma.diningTable.findUnique({
    where: { id: input.id },
    include: { _count: { select: { sessions: true, tasks: true } } },
  });
  if (!table) throw new NotFoundError("table");
  const used = table._count.sessions + table._count.tasks > 0;
  await prisma.$transaction(async (tx) => {
    if (used) {
      await tx.diningTable.update({ where: { id: input.id }, data: { active: false } });
    } else {
      await tx.diningTable.delete({ where: { id: input.id } });
    }
    await audit(tx, input.actorId, used ? "table.archived" : "table.deleted", "table", input.id, {
      label: table.label,
    });
  });
  return { softDeleted: used };
}

export async function getAdminStaff(): Promise<AdminStaffDto[]> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    hasPin: user.pinHash !== null,
    hasPassword: user.passwordHash !== null,
  }));
}

function validatePin(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) throw new DomainError("PIN must be 4 to 6 digits");
}

export async function createStaff(input: {
  name: string;
  role: StaffRole;
  pin?: string;
  password?: string;
  actorId?: string | null;
}): Promise<{ id: string }> {
  const name = required(input.name, "Name");
  if (!["ADMIN", "RECEPTIONIST", "WAITER", "CHEF"].includes(input.role)) {
    throw new DomainError("Unknown role");
  }
  let pinHash: string | null = null;
  let passwordHash: string | null = null;
  if (input.role === "ADMIN") {
    if (!input.password || input.password.length < 6) {
      throw new DomainError("Admin passwords must be at least 6 characters");
    }
    passwordHash = hashSecret(input.password);
  } else {
    if (!input.pin) throw new DomainError("Staff need a 4–6 digit PIN");
    validatePin(input.pin);
    pinHash = hashSecret(input.pin);
  }
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, role: input.role, pinHash, passwordHash },
    });
    await audit(tx, input.actorId, "staff.created", "user", user.id, { name, role: input.role });
    return user;
  });
  return { id: created.id };
}

export async function updateStaff(input: {
  id: string;
  name?: string;
  role?: StaffRole;
  active?: boolean;
  pin?: string;
  password?: string;
  actorId?: string | null;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: input.id } });
  if (!user) throw new NotFoundError("staff member");
  if (input.actorId === input.id && input.active === false) {
    throw new DomainError("You cannot deactivate your own account");
  }
  const name = input.name !== undefined ? required(input.name, "Name") : undefined;
  const role = input.role ?? user.role;
  let pinHash = user.pinHash;
  if (input.pin) {
    validatePin(input.pin);
    pinHash = hashSecret(input.pin);
  }
  let passwordHash = user.passwordHash;
  if (input.password !== undefined) {
    if (input.password.length < 6) {
      throw new DomainError("Admin passwords must be at least 6 characters");
    }
    passwordHash = hashSecret(input.password);
  }

  if (role === "ADMIN" && !passwordHash) {
    throw new DomainError("An admin needs a password");
  }
  if (role !== "ADMIN" && !pinHash) {
    throw new DomainError("Staff need a PIN");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.id },
      data: {
        name,
        role,
        active: input.active,
        pinHash,
        passwordHash,
      },
    });
    await audit(tx, input.actorId, "staff.updated", "user", input.id, {
      name,
      role,
      active: input.active,
      credentialsChanged: Boolean(input.pin || input.password),
    });
  });
}

const SETTINGS_BOUNDS: Record<string, [number, number]> = {
  DECIDE_WINDOW_S: [30, 3600],
  SEATED_CONFIRM_S: [5, 300],
  EMPTY_CONFIRM_S: [5, 600],
  SNOOZE_S: [30, 3600],
  REALERT_S: [10, 600],
  ALERT_ESCALATE_S: [10, 1800],
  VISION_MUTE_S: [30, 3600],
  TICKET_AMBER_S: [60, 7200],
  TICKET_RED_S: [60, 14400],
  TAX_RATE_PERCENT: [0, 100],
};

export async function getAdminSettings(): Promise<AdminSettingsDto> {
  const [settings, profile] = await Promise.all([
    loadSettings(),
    prisma.restaurantProfile.findUnique({ where: { id: "default" } }),
  ]);
  return {
    settings,
    restaurant: {
      name: profile?.name ?? "DineSense",
      address: profile?.address ?? "",
      phone: profile?.phone ?? null,
      gstin: profile?.gstin ?? null,
      billFooter: profile?.billFooter ?? null,
    },
  };
}

export async function updateAdminSettings(input: {
  settings: Record<string, unknown>;
  actorId?: string | null;
}): Promise<Settings> {
  const allowed = new Set([
    ...Object.keys(SETTINGS_BOUNDS),
    "BUSINESS_DAY_START",
    "TAX_MODE",
    "BILL_NUMBER_PREFIX",
  ]);
  const updates: Array<{ key: string; value: number | string }> = [];

  for (const [key, raw] of Object.entries(input.settings)) {
    if (!allowed.has(key)) throw new DomainError(`Unknown setting ${key}`);
    if (key === "BUSINESS_DAY_START") {
      if (typeof raw !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
        throw new DomainError("Business day start must be HH:mm");
      }
      updates.push({ key, value: raw });
    } else if (key === "TAX_MODE") {
      if (raw !== "exclusive" && raw !== "inclusive") throw new DomainError("Invalid tax mode");
      updates.push({ key, value: raw });
    } else if (key === "BILL_NUMBER_PREFIX") {
      if (typeof raw !== "string" || !/^[A-Za-z0-9]{1,8}$/.test(raw)) {
        throw new DomainError("Bill prefix must be 1–8 letters or digits");
      }
      updates.push({ key, value: raw.toUpperCase() });
    } else {
      const bounds = SETTINGS_BOUNDS[key];
      if (!bounds) throw new DomainError(`Unknown setting ${key}`);
      const [min, max] = bounds;
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(value) || value < min || value > max) {
        throw new DomainError(`${key} must be between ${min} and ${max}`);
      }
      updates.push({ key, value: Math.round(value) });
    }
  }
  if (updates.length === 0) throw new DomainError("No settings to update");

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.setting.upsert({
        where: { key: update.key },
        create: { key: update.key, value: update.value },
        update: { value: update.value },
      });
    }
    await audit(tx, input.actorId, "settings.updated", "setting", "global", {
      keys: updates.map((update) => update.key),
    });
  });
  await notify("table.updated", { reason: "settings-updated" });
  return loadSettings();
}

export async function updateRestaurant(input: {
  name: string;
  address: string;
  phone?: string | null;
  gstin?: string | null;
  billFooter?: string | null;
  actorId?: string | null;
}): Promise<void> {
  const name = required(input.name, "Restaurant name");
  const address = required(input.address, "Address");
  await prisma.$transaction(async (tx) => {
    await tx.restaurantProfile.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        name,
        address,
        phone: input.phone?.trim() || null,
        gstin: input.gstin?.trim() || null,
        billFooter: input.billFooter?.trim() || null,
      },
      update: {
        name,
        address,
        phone: input.phone?.trim() || null,
        gstin: input.gstin?.trim() || null,
        billFooter: input.billFooter?.trim() || null,
      },
    });
    await audit(tx, input.actorId, "restaurant.updated", "restaurant", "default", { name });
  });
}

function cameraDto(camera: {
  id: string;
  name: string;
  zoneId: string;
  status: string;
  fps: number | null;
  lastHeartbeatAt: Date | null;
  active: boolean;
  rtspUrlEncrypted: string;
  zone: { name: string };
  _count: { tables: number };
}): AdminCameraDto {
  return {
    id: camera.id,
    name: camera.name,
    zoneId: camera.zoneId,
    zoneName: camera.zone.name,
    status: camera.status as AdminCameraDto["status"],
    fps: camera.fps,
    lastHeartbeatAt: camera.lastHeartbeatAt?.toISOString() ?? null,
    active: camera.active,
    tableCount: camera._count.tables,
    hasRtsp: Boolean(camera.rtspUrlEncrypted),
  };
}

export async function getAdminCameras(): Promise<AdminCameraDto[]> {
  const cameras = await prisma.camera.findMany({
    include: {
      zone: { select: { name: true } },
      _count: { select: { tables: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return cameras.map(cameraDto);
}

function validateStreamUrl(url: string): string {
  const trimmed = required(url, "RTSP URL");
  if (!/^(rtsp|rtsps|http|https):\/\//i.test(trimmed)) {
    throw new DomainError("Use an rtsp:// or https:// stream URL");
  }
  return trimmed;
}

export async function createCamera(input: {
  name: string;
  zoneId: string;
  rtspUrl: string;
  actorId?: string | null;
}): Promise<{ id: string }> {
  const name = required(input.name, "Camera name");
  const url = validateStreamUrl(input.rtspUrl);
  const created = await prisma.$transaction(async (tx) => {
    const zone = await tx.zone.findUnique({ where: { id: input.zoneId } });
    if (!zone) throw new NotFoundError("floor");
    const camera = await tx.camera.create({
      data: {
        name,
        zoneId: input.zoneId,
        rtspUrlEncrypted: encryptSecret(url, encryptionKeySource()),
      },
    });
    await audit(tx, input.actorId, "camera.created", "camera", camera.id, {
      name,
      zone: zone.name,
    });
    return camera;
  });
  await notify("camera.status", { cameraId: created.id, status: "UNKNOWN" });
  return { id: created.id };
}

export async function updateCamera(input: {
  id: string;
  name?: string;
  zoneId?: string;
  rtspUrl?: string;
  active?: boolean;
  actorId?: string | null;
}): Promise<void> {
  const camera = await prisma.camera.findUnique({
    where: { id: input.id },
    include: { _count: { select: { tables: true } } },
  });
  if (!camera) throw new NotFoundError("camera");
  const name = input.name !== undefined ? required(input.name, "Camera name") : undefined;
  if (input.zoneId && input.zoneId !== camera.zoneId && camera._count.tables > 0) {
    throw new ConflictError("Unassign the tables before moving the camera to another floor");
  }
  if (input.zoneId) {
    const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } });
    if (!zone) throw new NotFoundError("floor");
  }
  const encrypted = input.rtspUrl
    ? encryptSecret(validateStreamUrl(input.rtspUrl), encryptionKeySource())
    : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.camera.update({
      where: { id: input.id },
      data: {
        name,
        zoneId: input.zoneId,
        rtspUrlEncrypted: encrypted,
        active: input.active,
      },
    });
    await audit(tx, input.actorId, "camera.updated", "camera", input.id, {
      name,
      zoneId: input.zoneId,
      active: input.active,
      credentialsChanged: Boolean(input.rtspUrl),
    });
  });
  await notify("camera.status", { cameraId: input.id, active: input.active });
}

export async function deleteCamera(input: {
  id: string;
  actorId?: string | null;
}): Promise<{ softDeleted: boolean }> {
  const camera = await prisma.camera.findUnique({
    where: { id: input.id },
    include: { _count: { select: { tables: true, events: true } } },
  });
  if (!camera) throw new NotFoundError("camera");
  const used = camera._count.tables + camera._count.events > 0;
  await prisma.$transaction(async (tx) => {
    if (used) {
      await tx.camera.update({ where: { id: input.id }, data: { active: false } });
    } else {
      await tx.camera.delete({ where: { id: input.id } });
    }
    await audit(tx, input.actorId, used ? "camera.deactivated" : "camera.deleted", "camera", input.id, {
      name: camera.name,
    });
  });
  await notify("camera.status", { cameraId: input.id, active: false });
  return { softDeleted: used };
}

function polygonOf(value: unknown): number[][] | null {
  if (!Array.isArray(value)) return null;
  const points: number[][] = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push([x, y]);
  }
  return points.length >= 3 ? points : null;
}

export async function getCameraCalibration(cameraId: string): Promise<CameraCalibrationDto> {
  const camera = await prisma.camera.findUnique({
    where: { id: cameraId },
    include: {
      zone: { select: { name: true } },
      _count: { select: { tables: true } },
    },
  });
  if (!camera) throw new NotFoundError("camera");
  const tables = await prisma.diningTable.findMany({
    where: { zoneId: camera.zoneId, active: true },
    orderBy: { label: "asc" },
  });
  return {
    camera: cameraDto(camera),
    tables: tables.map((table): CameraCalibrationTableDto => ({
      id: table.id,
      label: table.label,
      cameraId: table.cameraId,
      visionMutedUntil: table.visionMutedUntil?.toISOString() ?? null,
      polygon: polygonOf(table.zonePolygon),
    })),
  };
}

export async function setTableZone(input: {
  tableId: string;
  cameraId: string;
  polygon: number[][];
  actorId?: string | null;
}): Promise<{ polygon: number[][] }> {
  if (!Array.isArray(input.polygon) || input.polygon.length < 3) {
    throw new DomainError("Draw at least three points");
  }
  const points = input.polygon.map((point) => {
    if (!Array.isArray(point) || point.length !== 2) {
      throw new DomainError("Each point needs an x and y");
    }
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
      throw new DomainError("Points must be normalized between 0 and 1");
    }
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  });

  const result = await prisma.$transaction(async (tx) => {
    const [table, camera] = await Promise.all([
      tx.diningTable.findUnique({ where: { id: input.tableId } }),
      tx.camera.findUnique({ where: { id: input.cameraId } }),
    ]);
    if (!table) throw new NotFoundError("table");
    if (!camera) throw new NotFoundError("camera");
    if (table.zoneId !== camera.zoneId) {
      throw new DomainError("The camera and table must be on the same floor");
    }
    const updated = await tx.diningTable.update({
      where: { id: input.tableId },
      data: { cameraId: input.cameraId, zonePolygon: points },
    });
    await audit(tx, input.actorId, "camera.table_zone_set", "table", input.tableId, {
      cameraId: input.cameraId,
      points: points.length,
    });
    return updated;
  });
  await notify("table.updated", { tableId: result.id, reason: "calibration" });
  return { polygon: points };
}

export async function getRecentDetections(input: {
  cameraId?: string;
  tableId?: string;
  limit?: number;
}): Promise<VisionDetectionDto[]> {
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 200);
  const events = await prisma.visionEvent.findMany({
    where: {
      ...(input.cameraId ? { cameraId: input.cameraId } : {}),
      ...(input.tableId ? { tableId: input.tableId } : {}),
    },
    include: {
      table: { select: { label: true } },
      camera: { select: { name: true } },
    },
    orderBy: { ts: "desc" },
    take: limit,
  });
  return events.map((event) => ({
    id: event.id,
    eventId: event.eventId,
    tableId: event.tableId,
    tableLabel: event.table?.label ?? null,
    cameraId: event.cameraId,
    cameraName: event.camera?.name ?? null,
    state: event.state,
    personCount: event.personCount,
    confidence: event.confidence,
    ts: event.ts.toISOString(),
    receivedAt: event.createdAt.toISOString(),
  }));
}
