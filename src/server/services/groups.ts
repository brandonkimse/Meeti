import "server-only";
import { randomInt } from "node:crypto";
import type { GroupDetail, GroupSummary, HangoutListItem, HangoutStatus, PublicUser } from "@/lib/types";
import { HttpError } from "../auth";
import { newId, now, one, q, run, tx } from "../db";
import { publish } from "../realtime";

type UserRow = { id: string; name: string; avatar_url: string | null; is_demo: number };

/** `online` is filled in by the browser from Realtime presence; demo friends are always online. */
export function toPublicUser(u: UserRow): PublicUser {
  return { id: u.id, name: u.name, avatarUrl: u.avatar_url, online: !!u.is_demo, isDemo: !!u.is_demo };
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function inviteCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function membership(userId: string, groupId: string) {
  return one<{ role: "owner" | "member" }>("SELECT role FROM memberships WHERE group_id = ? AND user_id = ?", groupId, userId);
}

export async function assertMember(userId: string, groupId: string) {
  const m = await membership(userId, groupId);
  if (!m) throw new HttpError(404, "Group not found.");
  return m;
}

export async function groupMembers(groupId: string): Promise<(PublicUser & { role: string; joinedAt: number })[]> {
  const rows = await q<UserRow & { role: string; joined_at: number }>(
    `SELECT u.id, u.name, u.avatar_url, u.is_demo, m.role, m.joined_at
       FROM memberships m JOIN profiles u ON u.id = m.user_id
      WHERE m.group_id = ? ORDER BY m.role = 'owner' DESC, m.joined_at`,
    groupId,
  );
  return rows.map((r) => ({ ...toPublicUser(r), role: r.role, joinedAt: r.joined_at }));
}

export async function userGroupIds(userId: string): Promise<string[]> {
  return (await q<{ group_id: string }>("SELECT group_id FROM memberships WHERE user_id = ?", userId)).map((r) => r.group_id);
}

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  emoji: string | null;
  invite_code: string;
  owner_id: string;
  created_at: number;
  role: "owner" | "member";
};

type HangoutRow = {
  id: string;
  title: string;
  starts_at: number;
  ends_at: number;
  status: HangoutStatus;
  mode: HangoutListItem["mode"];
  dest_name: string | null;
  dest_image_url: string | null;
  category: HangoutListItem["category"];
  group_id: string;
  group_name?: string;
  participant_count: number;
};

export function toListItem(h: HangoutRow): HangoutListItem {
  return {
    id: h.id,
    title: h.title,
    startsAt: h.starts_at,
    endsAt: h.ends_at,
    status: h.status,
    mode: h.mode,
    destName: h.dest_name,
    destImageUrl: h.dest_image_url,
    category: h.category,
    participantCount: h.participant_count,
    groupId: h.group_id,
    groupName: h.group_name,
  };
}

const HANGOUT_COLS = `h.id, h.title, h.starts_at, h.ends_at, h.status, h.mode, h.dest_name, h.dest_image_url, h.category, h.group_id,
  (SELECT COUNT(*) FROM participants p WHERE p.hangout_id = h.id AND p.rsvp != 'declined') AS participant_count`;

async function summary(g: GroupRow): Promise<GroupSummary> {
  const [members, next] = await Promise.all([
    groupMembers(g.id),
    one<{ id: string; title: string; starts_at: number; status: HangoutStatus }>(
      `SELECT id, title, starts_at, status FROM hangouts WHERE group_id = ? AND status IN ('planning','live')
        ORDER BY status = 'live' DESC, starts_at LIMIT 1`,
      g.id,
    ),
  ]);
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    imageUrl: g.image_url,
    emoji: g.emoji,
    role: g.role,
    memberCount: members.length,
    members,
    nextHangout: next ? { id: next.id, title: next.title, startsAt: next.starts_at, status: next.status } : null,
  };
}

export async function listGroups(userId: string): Promise<GroupSummary[]> {
  const rows = await q<GroupRow>(
    `SELECT g.*, m.role FROM groups g JOIN memberships m ON m.group_id = g.id
      WHERE m.user_id = ? ORDER BY g.created_at DESC`,
    userId,
  );
  return Promise.all(rows.map(summary));
}

export async function upcomingForUser(userId: string): Promise<HangoutListItem[]> {
  const rows = await q<HangoutRow>(
    `SELECT ${HANGOUT_COLS}, g.name AS group_name FROM hangouts h
       JOIN groups g ON g.id = h.group_id
       JOIN memberships m ON m.group_id = h.group_id AND m.user_id = ?
      WHERE h.status IN ('planning','live')
      ORDER BY h.status = 'live' DESC, h.starts_at`,
    userId,
  );
  return rows.map(toListItem);
}

export async function getGroup(userId: string, groupId: string): Promise<GroupDetail> {
  const g = await one<GroupRow>(
    "SELECT g.*, m.role FROM groups g JOIN memberships m ON m.group_id = g.id AND m.user_id = ? WHERE g.id = ?",
    userId,
    groupId,
  );
  if (!g) throw new HttpError(404, "Group not found.");
  const [s, hangouts] = await Promise.all([
    summary(g),
    q<HangoutRow>(
      `SELECT ${HANGOUT_COLS} FROM hangouts h WHERE h.group_id = ?
        ORDER BY CASE h.status WHEN 'live' THEN 0 WHEN 'planning' THEN 1 ELSE 2 END,
                 CASE WHEN h.status IN ('planning','live') THEN h.starts_at ELSE -h.starts_at END`,
      groupId,
    ),
  ]);
  return { ...s, inviteCode: g.invite_code, ownerId: g.owner_id, createdAt: g.created_at, hangouts: hangouts.map(toListItem) };
}

export async function createGroup(userId: string, input: { name: string; description: string | null; imageUrl: string | null; emoji: string | null }) {
  const id = newId();
  await tx(async () => {
    await run(
      "INSERT INTO groups (id, name, description, image_url, emoji, invite_code, owner_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
      id,
      input.name,
      input.description,
      input.imageUrl,
      input.emoji,
      inviteCode(),
      userId,
      now(),
    );
    await run("INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?,?, 'owner', ?)", id, userId, now());
  });
  return id;
}

export async function updateGroup(
  userId: string,
  groupId: string,
  patch: { name?: string; description?: string | null; imageUrl?: string | null; emoji?: string | null },
) {
  const m = await assertMember(userId, groupId);
  if (m.role !== "owner") throw new HttpError(403, "Only the group owner can edit the group.");
  if (patch.name !== undefined) await run("UPDATE groups SET name = ? WHERE id = ?", patch.name, groupId);
  if (patch.description !== undefined) await run("UPDATE groups SET description = ? WHERE id = ?", patch.description, groupId);
  if (patch.imageUrl !== undefined) await run("UPDATE groups SET image_url = ? WHERE id = ?", patch.imageUrl, groupId);
  if (patch.emoji !== undefined) await run("UPDATE groups SET emoji = ? WHERE id = ?", patch.emoji, groupId);
  await publish(`group:${groupId}`, { type: "group.updated", groupId });
}

export async function regenerateInvite(userId: string, groupId: string) {
  const m = await assertMember(userId, groupId);
  if (m.role !== "owner") throw new HttpError(403, "Only the group owner can reset the invite link.");
  const code = inviteCode();
  await run("UPDATE groups SET invite_code = ? WHERE id = ?", code, groupId);
  await publish(`group:${groupId}`, { type: "group.updated", groupId });
  return code;
}

export async function previewInvite(code: string) {
  const g = await one<{ id: string; name: string; description: string | null; image_url: string | null; emoji: string | null }>(
    "SELECT id, name, description, image_url, emoji FROM groups WHERE invite_code = ?",
    code.toUpperCase().trim(),
  );
  if (!g) throw new HttpError(404, "This invite link is invalid or has been reset.");
  const members = await groupMembers(g.id);
  return { id: g.id, name: g.name, description: g.description, imageUrl: g.image_url, emoji: g.emoji, memberCount: members.length, members: members.slice(0, 6) };
}

export async function joinByCode(userId: string, code: string) {
  const g = await previewInvite(code);
  if (!(await membership(userId, g.id))) {
    await tx(async () => {
      await run("INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?,?, 'member', ?) ON CONFLICT DO NOTHING", g.id, userId, now());
      // Join any hangouts still being planned so the newcomer can weigh in.
      const open = await q<{ id: string }>("SELECT id FROM hangouts WHERE group_id = ? AND status = 'planning'", g.id);
      for (const h of open)
        await run("INSERT INTO participants (hangout_id, user_id, rsvp, updated_at) VALUES (?,?, 'going', ?) ON CONFLICT DO NOTHING", h.id, userId, now());
    });
    await publish(`group:${g.id}`, { type: "group.members", groupId: g.id });
  }
  return g.id;
}

async function removeFromGroup(groupId: string, userId: string) {
  const active = await tx(async () => {
    await run("DELETE FROM memberships WHERE group_id = ? AND user_id = ?", groupId, userId);
    const hs = await q<{ id: string }>("SELECT id FROM hangouts WHERE group_id = ? AND status IN ('planning','live')", groupId);
    for (const h of hs) {
      await run("DELETE FROM participants WHERE hangout_id = ? AND user_id = ?", h.id, userId);
      await run("DELETE FROM votes WHERE hangout_id = ? AND user_id = ?", h.id, userId);
      await run("DELETE FROM location_shares WHERE hangout_id = ? AND user_id = ?", h.id, userId);
    }
    return hs;
  });
  await Promise.all(active.map((h) => publish(`hangout:${h.id}`, { type: "hangout.updated", hangoutId: h.id })));
}

export async function leaveGroup(userId: string, groupId: string) {
  await assertMember(userId, groupId);
  await removeFromGroup(groupId, userId);
  const remaining = await q<{ user_id: string }>("SELECT user_id FROM memberships WHERE group_id = ? ORDER BY joined_at", groupId);
  if (!remaining.length) {
    await run("DELETE FROM groups WHERE id = ?", groupId);
    return;
  }
  const owner = await one<{ owner_id: string }>("SELECT owner_id FROM groups WHERE id = ?", groupId);
  if (owner?.owner_id === userId) {
    // Hand ownership to the longest-standing member.
    const heir = remaining[0].user_id;
    await run("UPDATE groups SET owner_id = ? WHERE id = ?", heir, groupId);
    await run("UPDATE memberships SET role = 'owner' WHERE group_id = ? AND user_id = ?", groupId, heir);
  }
  await publish(`group:${groupId}`, { type: "group.members", groupId });
}

export async function removeMember(userId: string, groupId: string, memberId: string) {
  const m = await assertMember(userId, groupId);
  if (m.role !== "owner") throw new HttpError(403, "Only the group owner can remove members.");
  if (memberId === userId) throw new HttpError(400, "Use “Leave group” to remove yourself.");
  if (!(await membership(memberId, groupId))) throw new HttpError(404, "That person isn't in this group.");
  await removeFromGroup(groupId, memberId);
  await publish(`group:${groupId}`, { type: "group.members", groupId });
  await publish(`user:${memberId}`, { type: "group.removed", groupId });
}
