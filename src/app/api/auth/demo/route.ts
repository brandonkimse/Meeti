import { HttpError } from "@/server/auth";
import { config } from "@/server/config";
import { handle } from "@/server/http";
import { createDemoWorld } from "@/server/services/demo";

export const maxDuration = 60;

export const POST = handle(async () => {
  if (!config.demoMode) throw new HttpError(404, "Demo mode is off. Set MEETI_DEMO_MODE=true to enable it.");
  try {
    await createDemoWorld();
  } catch (e) {
    throw new HttpError(500, (e as Error).message);
  }
  return { ok: true };
});
