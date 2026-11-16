import "server-only";
import { one, run } from "./db";
import { supabaseServer } from "./supabase";

/** Authentication is handled by Supabase Auth; app data lives in public.profiles. */

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_demo: number;
  created_at: number;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const authUser = data.user;
  if (!authUser) return null;
  let profile = await one<User>("SELECT id, email, name, avatar_url, is_demo, created_at FROM profiles WHERE id = ?", authUser.id);
  if (!profile) {
    // The signup trigger normally creates this; recover if it didn't run.
    const name = (authUser.user_metadata?.name as string | undefined)?.trim() || authUser.email?.split("@")[0] || "Friend";
    await run("INSERT INTO profiles (id, email, name) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING", authUser.id, authUser.email ?? null, name);
    profile = await one<User>("SELECT id, email, name, avatar_url, is_demo, created_at FROM profiles WHERE id = ?", authUser.id);
  }
  return profile ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Please sign in.");
  return u;
}

/** Demo-only: a profile with no login (a simulated friend). */
export async function createBotProfile(name: string): Promise<string> {
  const row = await one<{ id: string }>("INSERT INTO profiles (name, is_demo) VALUES (?, 1) RETURNING id", name);
  return row!.id;
}
