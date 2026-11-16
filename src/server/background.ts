import "server-only";
import { after } from "next/server";

/**
 * Run work after the response is sent. On Vercel, `after()` keeps the function
 * alive until the promise settles, so background jobs aren't cut off.
 */
export function background(task: () => Promise<unknown>) {
  const safe = () => task().catch((e) => console.warn("[meeti] background task failed:", (e as Error).message));
  try {
    after(safe);
  } catch {
    // Outside a request scope (e.g. scripts): just run it.
    void safe();
  }
}
