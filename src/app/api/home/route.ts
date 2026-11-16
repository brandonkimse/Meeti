import { requireUser } from "@/server/auth";
import { providerStatus } from "@/server/config";
import { handle } from "@/server/http";
import { listGroups, upcomingForUser } from "@/server/services/groups";

export const GET = handle(async () => {
  const u = await requireUser();
  return { groups: await listGroups(u.id), upcoming: await upcomingForUser(u.id), providers: providerStatus() };
});
