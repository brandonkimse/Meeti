import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { now, one, q, run, tx } from "./db";
import { supabaseServer } from "./supabase";

/**
 * Two kinds of people use Meeti:
 * - Users sign in with Supabase Auth; their data lives in public.profiles.
 * - Guests join a plan from a share link with just a name. They're profiles
 *   with is_guest = 1, recognised by a random token in an httpOnly cookie.
 *   If a guest later creates an account, their activity moves to it (claimGuest).
 */

export type User = {
  id: string;
  email: string | null;
  name: string;
  avatar_url: string | null;
  is_demo: number;
  is_guest: number;
  created_at: number;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const PROFILE_COLS = "id, email, name, avatar_url, is_demo, is_guest, created_at";
export const GUEST_COOKIE = "meeti_guest";
const GUEST_TTL_S = 60 * 60 * 24 * 90;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * The signed-in user (never a guest). The login token is verified locally
 * against the project's public signing key (getClaims), so this doesn't call
 * Supabase Auth on every request. Cached for the duration of one request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const id = claims.sub;
  let profile = await one<User>(`SELECT ${PROFILE_COLS} FROM profiles WHERE id = ?`, id);
  if (!profile) {
    // The signup trigger normally creates this; recover if it didn't run.
    const email = typeof claims.email === "string" ? claims.email : null;
    const meta = (claims.user_metadata ?? {}) as { name?: string };
    const name = meta.name?.trim() || email?.split("@")[0] || "Friend";
    await run("INSERT INTO profiles (id, email, name) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING", id, email, name);
    profile = await one<User>(`SELECT ${PROFILE_COLS} FROM profiles WHERE id = ?`, id);
  }
  return profile ?? null;
});

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Please sign in.");
  return u;
}

/** The guest recognised by this browser's cookie, if any. */
export async function getGuest(): Promise<User | null> {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const g = await one<User>(
    `SELECT ${PROFILE_COLS.split(", ").map((c) => `p.${c}`).join(", ")}
       FROM guest_sessions s JOIN profiles p ON p.id = s.profile_id
      WHERE s.token_hash = ? AND p.is_guest = 1`,
    hashToken(token),
  );
  return g ?? null;
}

/** Whoever is using the app: a signed-in user first, otherwise a guest. */
export async function getActor(): Promise<User | null> {
  return (await getCurrentUser()) ?? (await getGuest());
}

export async function requireActor(): Promise<User> {
  const a = await getActor();
  if (!a) throw new HttpError(401, "Open the plan's link to join, or sign in.");
  return a;
}

/** Create a guest profile for this browser and set its cookie. */
export async function createGuest(name: string): Promise<User> {
  const token = randomBytes(32).toString("base64url");
  const g = await tx(async () => {
    const p = await one<User>(`INSERT INTO profiles (name, is_guest) VALUES (?, 1) RETURNING ${PROFILE_COLS}`, name);
    await run("INSERT INTO guest_sessions (token_hash, profile_id, created_at) VALUES (?, ?, ?)", hashToken(token), p!.id, now());
    return p!;
  });
  (await cookies()).set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_TTL_S,
  });
  return g;
}

/**
 * After signing in or up: move this browser's guest activity (plans joined,
 * starting points, votes, suggestions, arrivals) onto the account, then delete
 * the guest. Where both took part in the same plan, the account's data wins.
 */
export async function claimGuest(userId: string): Promise<void> {
  const jar = await cookies();
  const token = jar.get(GUEST_COOKIE)?.value;
  if (!token) return;
  const s = await one<{ profile_id: string }>(
    "SELECT s.profile_id FROM guest_sessions s JOIN profiles p ON p.id = s.profile_id WHERE s.token_hash = ? AND p.is_guest = 1",
    hashToken(token),
  );
  if (s && s.profile_id !== userId) {
    const guestId = s.profile_id;
    await tx(async () => {
      for (const table of ["participants", "votes", "location_shares"]) {
        await run(`DELETE FROM ${table} WHERE user_id = ? AND hangout_id IN (SELECT hangout_id FROM ${table} WHERE user_id = ?)`, guestId, userId);
        await run(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`, userId, guestId);
      }
      await run("UPDATE suggestions SET added_by = ? WHERE added_by = ?", userId, guestId);
      // A guest can end up hosting a plan when its host deletes their account.
      await run("UPDATE hangouts SET created_by = ? WHERE created_by = ?", userId, guestId);
      await run("DELETE FROM profiles WHERE id = ?", guestId);
    });
  }
  jar.delete(GUEST_COOKIE);
}

/** Demo-only: a profile with no login (a simulated friend). */
export async function createBotProfile(name: string): Promise<string> {
  const row = await one<{ id: string }>("INSERT INTO profiles (name, is_demo) VALUES (?, 1) RETURNING id", name);
  return row!.id;
}

/** Ids of hangouts this person takes part in (used to scope realtime for guests, etc.). */
export async function participantHangoutIds(profileId: string): Promise<string[]> {
  return (await q<{ hangout_id: string }>("SELECT hangout_id FROM participants WHERE user_id = ?", profileId)).map((r) => r.hangout_id);
}
