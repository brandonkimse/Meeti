import { getActor } from "@/server/auth";
import { config } from "@/server/config";

/** Proxies Google Places photos so the API key stays on the server. Only for people using Meeti (users or guests). */
export async function GET(req: Request) {
  if (!(await getActor().catch(() => null))) return new Response("Not found", { status: 404 });
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!config.googleMapsKey || !/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) return new Response("Not found", { status: 404 });
  const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${config.googleMapsKey}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok || !res.body) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "public, max-age=86400" },
  });
}
