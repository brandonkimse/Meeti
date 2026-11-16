import { createSession, HttpError } from "@/server/auth";
import { config } from "@/server/config";
import { handle } from "@/server/http";
import { createDemoWorld } from "@/server/services/demo";

export const POST = handle(async () => {
  if (!config.demoMode) throw new HttpError(404, "Demo mode is off. Set WHERE2_DEMO_MODE=true to enable it.");
  const userId = await createDemoWorld();
  await createSession(userId);
  return { ok: true };
});
