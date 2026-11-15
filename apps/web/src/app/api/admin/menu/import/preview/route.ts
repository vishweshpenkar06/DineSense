import { normalizeMenuRows, parseCsv } from "@dinesense/core";
import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;

async function rowsFromWorkbook(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] = cell.text ?? "";
    });
    rows.push(values.map((value) => value ?? ""));
  });
  return rows;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(["ADMIN"]);
    if ("error" in auth) return auth.error;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Upload a CSV or XLSX file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is larger than 2 MB" }, { status: 400 });
    }

    const name = (file as File).name?.toLowerCase() ?? "";
    let rows: string[][];
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      rows = await rowsFromWorkbook(Buffer.from(await file.arrayBuffer()));
    } else {
      rows = parseCsv(await file.text());
    }

    const result = normalizeMenuRows(rows);
    return ok({ ...result, fileName: name || "menu" });
  } catch (error) {
    return apiError(error);
  }
}
