import { DomainError } from "@dinesense/db";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", issues: error.issues },
      { status: 400 },
    );
  }
  console.error("[api]", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function parseLimit(value: string | null, fallback: number, max: number): number {
  const parsed = value ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
}
