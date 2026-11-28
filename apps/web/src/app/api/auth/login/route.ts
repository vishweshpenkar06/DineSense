import { loginDelayMs, verifySecret } from "@dinesense/core";
import { prisma } from "@dinesense/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import {
  SESSION_COOKIE,
  signSession,
  sessionCookieOptions,
  type SessionUser,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;

function clientKey(request: NextRequest): string {
  if (process.env.TRUST_PROXY !== "true") return "local";
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

async function failureState(key: string): Promise<{ count: number; lastAt: number }> {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await prisma.auditLog.findMany({
    where: { action: "auth.login_failed", createdAt: { gte: since } },
    select: { detail: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const keyRows = rows.filter((row) => {
    const detail = row.detail as { key?: unknown } | null;
    return detail?.key === key;
  });
  return {
    count: Math.max(keyRows.length, rows.length >= 15 ? 5 : 0),
    lastAt: keyRows[0]?.createdAt.getTime() ?? rows[0]?.createdAt.getTime() ?? 0,
  };
}

async function recordFailure(key: string): Promise<void> {
  await prisma.auditLog.create({
    data: { action: "auth.login_failed", entity: "auth", entityId: key, detail: { key } },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const key = clientKey(request);
    const state = await failureState(key);
    const delay = loginDelayMs(state.count);
    if (delay > 0 && Date.now() - state.lastAt < delay) {
      return NextResponse.json(
        { error: "Too many attempts. Wait before trying again." },
        { status: 429 },
      );
    }

    const body = loginSchema.parse(await request.json());
    const users = await prisma.user.findMany({
      where: {
        active: true,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }],
        ...(body.pin ? { pinHash: { not: null } } : { passwordHash: { not: null } }),
      },
      select: { id: true, name: true, role: true, pinHash: true, passwordHash: true, tokenVersion: true },
    });

    const match = users.find((user) =>
      body.pin
        ? verifySecret(body.pin, user.pinHash)
        : verifySecret(body.password ?? "", user.passwordHash),
    );

    if (!match) {
      await recordFailure(key);
      return NextResponse.json({ error: "Invalid PIN or password" }, { status: 401 });
    }

    const sessionUser: SessionUser = {
      id: match.id,
      name: match.name,
      role: match.role,
      tokenVersion: match.tokenVersion,
    };
    const token = await signSession(sessionUser);
    await prisma.auditLog.create({
      data: { actorId: match.id, action: "auth.login_success", entity: "auth", entityId: match.id },
    });

    const response = NextResponse.json({ user: sessionUser });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    return apiError(error);
  }
}
