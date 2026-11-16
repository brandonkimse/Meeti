import { CATEGORIES, MODES } from "@/lib/types";
import { requireUser } from "@/server/auth";
import { handle, num, oneOf, readBody, str } from "@/server/http";
import { createHangout } from "@/server/services/hangouts";

export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser();
  const b = await readBody(req);
  const id = createHangout(u.id, (await params).id, {
    title: str(b.title, "Title", { min: 1, max: 60 }),
    startsAt: num(b.startsAt, "Start time", { min: Date.now() - 6 * 3600_000 }),
    durationMin: b.durationMin != null ? num(b.durationMin, "Duration", { min: 30, max: 24 * 60 }) : 180,
    mode: oneOf(b.mode, "Transport mode", MODES.map((m) => m.id)),
    category: b.category ? oneOf(b.category, "Category", CATEGORIES.map((c) => c.id)) : null,
    pollClosesAt: b.pollClosesAt ? num(b.pollClosesAt, "Voting deadline", { min: Date.now() }) : null,
  });
  return { id };
});
