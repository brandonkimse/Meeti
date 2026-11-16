import { HttpError, requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { handle } from "@/server/http";
import { simulateMe } from "@/server/services/demo";
import { accessHangout } from "@/server/services/hangouts";

/** Demo mode only: simulate the signed-in user's journey. */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  if (!config.demoMode) throw new HttpError(404, "Not available.");
  const u = await requireUser();
  const id = (await params).id;
  accessHangout(u.id, id);
  try {
    await simulateMe(u.id, id);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return { ok: true };
});
