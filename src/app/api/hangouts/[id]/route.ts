import { MODES } from "@/lib/types";
import { requireUser } from "@/server/auth";
import { handle, num, oneOf, readBody, str } from "@/server/http";
import { ensureDemoJourneys } from "@/server/services/demo";
import { cancelHangout, getHangout, updateHangout } from "@/server/services/hangouts";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_req, { params }) => {
  const u = await requireUser();
  const id = (await params).id;
  const h = getHangout(u.id, id);
  if (h.status === "live" && h.providers.demoMode) void ensureDemoJourneys(id);
  return h;
});

export const PATCH = handle<Ctx>(async (req, { params }) => {
  const u = await requireUser();
  const b = await readBody(req);
  updateHangout(u.id, (await params).id, {
    title: b.title !== undefined ? str(b.title, "Title", { min: 1, max: 60 }) : undefined,
    startsAt: b.startsAt !== undefined ? num(b.startsAt, "Start time") : undefined,
    mode: b.mode !== undefined ? oneOf(b.mode, "Transport mode", MODES.map((m) => m.id)) : undefined,
  });
  return { ok: true };
});

export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const u = await requireUser();
  cancelHangout(u.id, (await params).id);
  return { ok: true };
});
