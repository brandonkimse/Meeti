import "server-only";
import { cookies } from "next/headers";
import { GUEST_COOKIE, HttpError } from "../auth";
import { one, q, run, tx } from "../db";
import { publish } from "../realtime";
import { supabaseAdmin, supabaseServer } from "../supabase";

/**
 * Permanently delete an account and the personal information tied to it.
 *
 * Shared things outlive the person who made them, so friends don't lose their plans:
 * - Groups they own pass to the longest-standing other member (or are deleted if empty).
 * - Plans they host pass to the group's owner, or to the next person in the plan
 *   (or are deleted if nobody else is in them).
 * Their memberships, starting points, votes and live locations are deleted with the
 * profile; places they added stay in the vote without their name.
 */
export async function deleteAccount(userId: string): Promise<void> {
  let admin: ReturnType<typeof supabaseAdmin>;
  try {
    admin = supabaseAdmin();
  } catch {
    throw new HttpError(503, "Account deletion isn't set up on this server yet. Please contact us and we'll delete it for you.");
  }

  const deletedHangouts: string[] = [];
  const touchedGroups = new Set<string>();

  await tx(async () => {
    // 1. Hand over or delete groups they own.
    const owned = await q<{ id: string }>("SELECT id FROM groups WHERE owner_id = ?", userId);
    for (const g of owned) {
      const heir = await one<{ user_id: string }>(
        "SELECT user_id FROM memberships WHERE group_id = ? AND user_id != ? ORDER BY joined_at LIMIT 1",
        g.id,
        userId,
      );
      if (heir) {
        await run("UPDATE groups SET owner_id = ? WHERE id = ?", heir.user_id, g.id);
        await run("UPDATE memberships SET role = 'owner' WHERE group_id = ? AND user_id = ?", g.id, heir.user_id);
        touchedGroups.add(g.id);
      } else {
        for (const h of await q<{ id: string }>("SELECT id FROM hangouts WHERE group_id = ?", g.id)) deletedHangouts.push(h.id);
        await run("DELETE FROM groups WHERE id = ?", g.id);
      }
    }

    // 2. Hand over or delete plans they host.
    const hosted = await q<{ id: string; group_id: string | null }>("SELECT id, group_id FROM hangouts WHERE created_by = ?", userId);
    for (const h of hosted) {
      const groupOwner = h.group_id ? await one<{ owner_id: string }>("SELECT owner_id FROM groups WHERE id = ?", h.group_id) : undefined;
      const next =
        groupOwner && groupOwner.owner_id !== userId
          ? groupOwner.owner_id
          : (
              await one<{ user_id: string }>(
                "SELECT user_id FROM participants WHERE hangout_id = ? AND user_id != ? ORDER BY rsvp = 'declined', seq LIMIT 1",
                h.id,
                userId,
              )
            )?.user_id;
      if (next) await run("UPDATE hangouts SET created_by = ? WHERE id = ?", next, h.id);
      else {
        await run("DELETE FROM hangouts WHERE id = ?", h.id);
        deletedHangouts.push(h.id);
      }
      if (h.group_id) touchedGroups.add(h.group_id);
    }

    // 3. Everything else personal cascades from the profile.
    for (const m of await q<{ group_id: string }>("SELECT group_id FROM memberships WHERE user_id = ?", userId)) touchedGroups.add(m.group_id);
    await run("DELETE FROM profiles WHERE id = ?", userId);
  });

  // 4. Remove the login itself. If this fails, signing in again recreates an empty
  //    profile and the user can retry, so no personal data is left behind.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error && !/not found/i.test(error.message)) {
    console.error("[meeti] deleting auth user failed:", error.message);
    throw new HttpError(500, "Your data was deleted, but we couldn't remove your login. Please try once more.");
  }

  // 5. Sign this browser out, and let everyone else's screens catch up.
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  (await cookies()).delete(GUEST_COOKIE);
  await Promise.allSettled([
    ...deletedHangouts.map((id) => publish(`hangout:${id}`, { type: "hangout.deleted", hangoutId: id })),
    ...[...touchedGroups].map((id) => publish(`group:${id}`, { type: "group.hangouts", groupId: id })),
  ]);
}
