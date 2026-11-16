import { HttpError, requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { handle } from "@/server/http";
import { ensureDemoJourneys, tickDemo } from "@/server/services/demo";
import { accessHangout } from "@/server/services/hangouts";

/** Demo mode only: the live screen calls this every couple of seconds to move simulated friends. */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  if (!config.demoMode) throw new HttpError(404, "Not available.");
  const u = await requireUser();
  const id = (await params).id;
  const { h } = await accessHangout(u.id, id);
  if (h.status !== "live") return { ok: true };
  await ensureDemoJourneys(id);
  await tickDemo(id);
  return { ok: true };
});
