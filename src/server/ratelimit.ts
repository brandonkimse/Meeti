import "server-only";
import { HttpError } from "./auth";
import { background } from "./background";
import { one, run } from "./db";

/**
 * Limits per action: [max requests, window in seconds]. Generous for real use,
 * tight enough that one script can't flood the database or get our server
 * blocked by the free map services everyone shares. Per-IP limits stay loose
 * because mobile carriers put many phones behind one address; the per-account
 * and per-email limits do the real work.
 */
export const LIMITS = {
  signupIp: [20, 3600],
  loginIp: [60, 600],
  loginEmail: [10, 600],
  resetIp: [20, 3600],
  resetEmail: [3, 3600],
  guestIp: [60, 3600],
  demoIp: [10, 3600],
  createPlan: [30, 86400],
  createGroup: [20, 86400],
  recsUser: [20, 3600],
  /** Across everyone: recommendations fan out to the public routing and place services. */
  recsGlobal: [40, 60],
  suggestUser: [60, 3600],
  searchUser: [90, 60],
  reverseUser: [30, 60],
  deleteAccount: [5, 3600],
} as const satisfies Record<string, readonly [number, number]>;

export type LimitName = keyof typeof LIMITS;

const MESSAGE = "You're going a bit fast. Please wait a moment and try again.";

/** The caller's IP. On Vercel, x-forwarded-for starts with the real client address. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Count one request against `name` for `who` and throw a 429 once the window's
 * limit is passed. If the counter itself fails, the request is let through:
 * a database hiccup shouldn't lock everyone out.
 */
export async function rateLimit(name: LimitName, who: string, message = MESSAGE): Promise<void> {
  const [limit, windowSec] = LIMITS[name];
  const windowMs = windowSec * 1000;
  const start = Math.floor(Date.now() / windowMs) * windowMs;
  let count: number;
  try {
    const row = await one<{ count: number }>(
      `INSERT INTO rate_limits (key, window_start, count, expires_at) VALUES (?, ?, 1, ?)
       ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      `${name}:${who.toLowerCase()}`,
      start,
      start + windowMs,
    );
    count = row?.count ?? 0;
  } catch (e) {
    console.warn("[meeti] rate limit check failed, allowing request:", (e as Error).message);
    return;
  }
  // Tidy up expired counters now and then.
  if (Math.random() < 0.02) background(() => run("DELETE FROM rate_limits WHERE expires_at < ?", Date.now()));
  if (count > limit) throw new HttpError(429, message);
}
