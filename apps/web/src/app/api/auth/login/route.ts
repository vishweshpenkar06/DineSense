import { verifySecret } from "@dinesense/core";
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

const attempts = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local"
  );
}

function isLocked(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const key = clientKey(request);
    if (isLocked(key)) {
      return NextResponse.json(
        { error: "Too many attempts. Wait a minute and try again." },
        { status: 429 },
      );
    }

    const body = loginSchema.parse(await request.json());
    const users = await prisma.user.findMany({
      where: {
        active: true,
        ...(body.pin ? { pinHash: { not: null } } : { passwordHash: { not: null } }),
      },
      select: { id: true, name: true, role: true, pinHash: true, passwordHash: true },
    });

    const match = users.find((user) =>
      body.pin
        ? verifySecret(body.pin, user.pinHash)
        : verifySecret(body.password ?? "", user.passwordHash),
    );

    if (!match) {
      recordFailure(key);
      return NextResponse.json({ error: "Invalid PIN or password" }, { status: 401 });
    }

    attempts.delete(key);
    const sessionUser: SessionUser = {
      id: match.id,
      name: match.name,
      role: match.role,
    };
    const token = await signSession(sessionUser);

    const response = NextResponse.json({ user: sessionUser });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    return apiError(error);
  }
}
