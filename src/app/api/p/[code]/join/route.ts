import { createGuest, getActor } from "@/server/auth";
import { handle, readBody, str } from "@/server/http";
import { joinByShareCode } from "@/server/services/hangouts";

/** Join a plan from its link: signed-in users join as themselves, everyone else as a named guest. */
export const POST = handle<{ params: Promise<{ code: string }> }>(async (req, { params }) => {
  const code = (await params).code;
  const b = await readBody(req);
  let actor = await getActor();
  if (!actor) actor = await createGuest(str(b.name, "Your name", { min: 1, max: 40 }));
  const hangoutId = await joinByShareCode(actor.id, code);
  return { hangoutId, isGuest: !!actor.is_guest };
});
