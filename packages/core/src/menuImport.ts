export type MenuImportError = { rowNumber: number; message: string };

export type MenuImportPrice = {
  groundPaise: number | null;
  firstPaise: number | null;
};

export type MenuImportVariant = {
  label: string;
  prices: MenuImportPrice;
};

export type MenuImportGroup = {
  category: string;
  item: string;
  localName: string | null;
  isVeg: boolean;
  needsKitchen: boolean;
  variants: MenuImportVariant[];
};

export type MenuImportResult = {
  rowCount: number;
  groups: MenuImportGroup[];
  errors: MenuImportError[];
  warnings: MenuImportError[];
};

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function parseFlag(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["y", "yes", "true", "1"].includes(normalized)) return true;
  if (["n", "no", "false", "0"].includes(normalized)) return false;
  return null;
}

function parsePrice(value: string): number | null | "invalid" {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return "invalid";
  return Math.round(parsed * 100);
}

const HEADERS = {
  category: ["category"],
  item: ["item"],
  localName: ["local_name", "local name", "localname"],
  variant: ["variant"],
  ground: ["price_ground", "price ground", "ground"],
  first: ["price_first", "price first", "first"],
  veg: ["veg", "is_veg"],
  needsKitchen: ["needs_kitchen", "needs kitchen"],
};

function headerIndex(headers: string[], names: string[]): number {
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

export function normalizeMenuRows(rows: string[][]): MenuImportResult {
  const errors: MenuImportError[] = [];
  const warnings: MenuImportError[] = [];
  if (rows.length === 0) {
    return { rowCount: 0, groups: [], errors: [{ rowNumber: 0, message: "The file is empty" }], warnings };
  }

  const headerRow = rows[0];
  if (!headerRow) {
    return { rowCount: 0, groups: [], errors: [{ rowNumber: 0, message: "The file is empty" }], warnings };
  }
  const headers = headerRow.map((header) => header.trim().toLowerCase());
  const columns = {
    category: headerIndex(headers, HEADERS.category),
    item: headerIndex(headers, HEADERS.item),
    localName: headerIndex(headers, HEADERS.localName),
    variant: headerIndex(headers, HEADERS.variant),
    ground: headerIndex(headers, HEADERS.ground),
    first: headerIndex(headers, HEADERS.first),
    veg: headerIndex(headers, HEADERS.veg),
    needsKitchen: headerIndex(headers, HEADERS.needsKitchen),
  };
  const missing = Object.entries(columns)
    .filter(([key, index]) => index < 0 && key !== "localName")
    .map(([key]) => key);
  if (missing.length > 0) {
    return {
      rowCount: Math.max(0, rows.length - 1),
      groups: [],
      errors: [{ rowNumber: 1, message: `Missing columns: ${missing.join(", ")}` }],
      warnings,
    };
  }

  const groups = new Map<string, MenuImportGroup>();
  const seen = new Set<string>();
  let rowCount = 0;
  const read = (cells: string[], index: number): string =>
    index >= 0 ? cells[index]?.trim() ?? "" : "";

  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    if (!cells) continue;
    const rowNumber = index + 1;
    if (cells.every((cell) => cell.trim() === "")) continue;
    rowCount += 1;

    const category = read(cells, columns.category);
    const item = read(cells, columns.item);
    const variant = read(cells, columns.variant);
    if (!category || !item || !variant) {
      errors.push({ rowNumber, message: "category, item and variant are required" });
      continue;
    }

    const ground = parsePrice(read(cells, columns.ground));
    const first = parsePrice(read(cells, columns.first));
    if (ground === "invalid" || first === "invalid") {
      errors.push({ rowNumber, message: "Prices must be numbers (rupees) or blank" });
      continue;
    }
    const veg = parseFlag(read(cells, columns.veg));
    if (veg === null) {
      errors.push({ rowNumber, message: "veg must be Y or N" });
      continue;
    }
    const needsKitchen = parseFlag(read(cells, columns.needsKitchen));
    if (needsKitchen === null) {
      errors.push({ rowNumber, message: "needs_kitchen must be Y or N" });
      continue;
    }

    if (ground === null) warnings.push({ rowNumber, message: `No ground-floor price for ${item} (${variant})` });
    if (first === null) warnings.push({ rowNumber, message: `No AC price for ${item} (${variant})` });

    const key = `${category.toLowerCase()}|${item.toLowerCase()}|${variant.toLowerCase()}`;
    if (seen.has(key)) {
      errors.push({ rowNumber, message: `Duplicate row for ${item} (${variant})` });
      continue;
    }
    seen.add(key);

    const groupKey = `${category.toLowerCase()}|${item.toLowerCase()}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        category,
        item,
        localName: read(cells, columns.localName) || null,
        isVeg: veg,
        needsKitchen,
        variants: [],
      };
      groups.set(groupKey, group);
    }
    group.variants.push({
      label: variant,
      prices: { groundPaise: ground, firstPaise: first },
    });
  }

  return { rowCount, groups: [...groups.values()], errors, warnings };
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return (
    rows
      .map((row) =>
        row
          .map((cell) => {
            const value = cell === null || cell === undefined ? "" : String(cell);
            return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
          })
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}
