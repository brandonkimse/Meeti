import { getCurrentUser } from "@/server/auth";
import { one } from "@/server/db";
import { connect, disconnect, publish, subscribe, type RealtimeEvent } from "@/server/realtime";
import { membership, userGroupIds } from "@/server/services/groups";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream. Each client gets events for itself, its groups and
 * (optionally) one hangout it is viewing — after membership is verified.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const hangoutId = url.searchParams.get("hangout");
  const groups = userGroupIds(user.id);
  const topics = [`user:${user.id}`, ...groups.map((g) => `group:${g}`)];
  if (hangoutId) {
    const h = one<{ group_id: string }>("SELECT group_id FROM hangouts WHERE id = ?", hangoutId);
    if (h && membership(user.id, h.group_id)) topics.push(`hangout:${hangoutId}`);
  }

  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: RealtimeEvent) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubs = topics.map((t) => subscribe(t, send));
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 25_000);

      if (connect(user.id)) for (const g of groups) publish(`group:${g}`, { type: "presence", userId: user.id, online: true });
      send({ type: "ready" });

      let done = false;
      cleanup = () => {
        if (done) return;
        done = true;
        clearInterval(ping);
        unsubs.forEach((u) => u());
        if (disconnect(user.id)) for (const g of groups) publish(`group:${g}`, { type: "presence", userId: user.id, online: false });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
