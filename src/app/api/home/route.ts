import { requireUser } from "@/server/auth";
import { providerStatus } from "@/server/config";
import { handle } from "@/server/http";
import { listGroups, recentForUser, upcomingForUser } from "@/server/services/groups";
import { sweepSoon } from "@/server/services/hangouts";

export const GET = handle(async () => {
  const u = await requireUser();
  sweepSoon();
  const [groups, upcoming, recent] = await Promise.all([listGroups(u.id), upcomingForUser(u.id), recentForUser(u.id)]);
  return { groups, upcoming, recent, providers: providerStatus() };
});
