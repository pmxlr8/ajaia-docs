/**
 * Mocked authentication. A reviewer picks a seeded demo user; we store their id
 * in an HMAC-signed, httpOnly cookie. There are no passwords, but the cookie
 * cannot be edited to impersonate someone else without SESSION_SECRET.
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { AppError } from "./errors";
import { getUserById, type User } from "./users";

export const SESSION_COOKIE = "ajaia_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return "dev-only-secret-do-not-use-in-prod";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function encodeSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return userId;
}

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const userId = decodeSession(store.get(SESSION_COOKIE)?.value);
  return userId ? getUserById(userId) : null;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AppError(401, "unauthorized", "Please sign in first.");
  return user;
}

export async function setSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
