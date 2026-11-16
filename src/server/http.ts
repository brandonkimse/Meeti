import "server-only";
import { HttpError } from "./auth";
import { DbTimeoutError } from "./db";

const SLOW_MS = 8000;

/** Wrap a route handler: JSON in/out, consistent errors, and a log line for slow requests. */
export function handle<C>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    const started = Date.now();
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof DbTimeoutError) {
        console.error("[meeti]", req.method, new URL(req.url).pathname, e.message);
        return Response.json({ error: "The database is taking too long to respond. Please try again." }, { status: 503 });
      }
      console.error("[meeti]", e);
      return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    } finally {
      const ms = Date.now() - started;
      if (ms > SLOW_MS) console.warn(`[meeti] slow request: ${req.method} ${new URL(req.url).pathname} took ${ms} ms`);
    }
  };
}

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}

export function str(v: unknown, field: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  if (v == null || v === "") {
    if (opts.optional) return "";
    throw new HttpError(400, `${field} is required.`);
  }
  if (typeof v !== "string") throw new HttpError(400, `${field} must be text.`);
  const s = v.trim();
  if (opts.min && s.length < opts.min) throw new HttpError(400, `${field} must be at least ${opts.min} characters.`);
  if (opts.max && s.length > opts.max) throw new HttpError(400, `${field} must be at most ${opts.max} characters.`);
  return s;
}

export function num(v: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new HttpError(400, `${field} must be a number.`);
  if (opts.min != null && n < opts.min) throw new HttpError(400, `${field} is out of range.`);
  if (opts.max != null && n > opts.max) throw new HttpError(400, `${field} is out of range.`);
  return n;
}

export function oneOf<T extends string>(v: unknown, field: string, values: readonly T[]): T {
  if (typeof v !== "string" || !values.includes(v as T)) throw new HttpError(400, `${field} is invalid.`);
  return v as T;
}

/** Accept uploaded images only as small data URLs (resized client-side). */
export function imageDataUrl(v: unknown, field: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw new HttpError(400, `${field} is invalid.`);
  if (/^https?:\/\//.test(v)) return v;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw new HttpError(400, `${field} must be an image.`);
  if (v.length > 400_000) throw new HttpError(400, `${field} is too large.`);
  return v;
}

export function lat(v: unknown) {
  return num(v, "Latitude", { min: -90, max: 90 });
}
export function lng(v: unknown) {
  return num(v, "Longitude", { min: -180, max: 180 });
}
