import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { newId, now, one, run } from "./db";

export const SESSION_COOKIE = "w2_session";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_demo: number;
  created_at: number;
  last_seen_at: number | null;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const t = now();
  run(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
    hashToken(token),
    userId,
    t,
    t + SESSION_TTL,
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = one<User>(
    `SELECT u.id, u.email, u.name, u.avatar_url, u.is_demo, u.created_at, u.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
    hashToken(token),
    now(),
  );
  return user ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Please sign in.");
  return u;
}

export function createUser(input: { email: string; name: string; password?: string; avatarUrl?: string | null; isDemo?: boolean }) {
  const id = newId();
  run(
    "INSERT INTO users (id, email, name, password_hash, avatar_url, is_demo, created_at) VALUES (?,?,?,?,?,?,?)",
    id,
    input.email.toLowerCase().trim(),
    input.name.trim(),
    input.password ? hashPassword(input.password) : null,
    input.avatarUrl ?? null,
    input.isDemo ? 1 : 0,
    now(),
  );
  return id;
}
