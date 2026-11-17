import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { archivedForUser } from "@/server/services/groups";

export const GET = handle(async () => {
  const u = await requireUser();
  return { items: await archivedForUser(u.id) };
});
