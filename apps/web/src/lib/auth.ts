import type { StaffRole } from "@dinesense/core";
import { prisma } from "@dinesense/db";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SESSION_COOKIE = "ds_session";
export const ALL_ROLES: readonly StaffRole[] = ["ADMIN", "RECEPTIONIST", "WAITER", "CHEF"];

export type SessionUser = { id: string; name: string; role: StaffRole; tokenVersion: number };

function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is not set");
    }
    return new TextEncoder().encode("dinesense-dev-session-secret");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, role: user.role, ver: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSecret());
}

export async function readSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (typeof payload.sub !== "string" || typeof payload.ver !== "number") {
      return null;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, role: true, active: true, tokenVersion: true },
    });
    if (
      !user ||
      !user.active ||
      user.tokenVersion !== payload.ver ||
      !ALL_ROLES.includes(user.role as StaffRole)
    ) {
      return null;
    }
    return { id: user.id, name: user.name, role: user.role as StaffRole, tokenVersion: user.tokenVersion };
  } catch {
    return null;
  }
}

export type Guard = { user: SessionUser } | { error: NextResponse };

export async function requireRole(roles: readonly StaffRole[]): Promise<Guard> {
  const user = await readSessionUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  }
  if (!roles.includes(user.role)) {
    return { error: NextResponse.json({ error: "Not allowed for this role" }, { status: 403 }) };
  }
  return { user };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  };
}
