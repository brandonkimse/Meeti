import "server-only";
import { randomInt } from "node:crypto";
import type { GroupDetail, GroupSummary, HangoutListItem, HangoutStatus, PublicUser } from "@/lib/types";
import { HttpError } from "../auth";
import { newId, now, one, q, run, tx } from "../db";
import { isOnline, publish } from "../realtime";

type UserRow = { id: string; name: string; avatar_url: string | null; is_demo: number };

export function toPublicUser(u: UserRow): PublicUser {
  return { id: u.id, name: u.name, avatarUrl: u.avatar_url, online: u.is_demo ? true : isOnline(u.id), isDemo: !!u.is_demo };
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

export function assertMember(userId: string, groupId: string) {
  const m = membership(userId, groupId);
  if (!m) throw new HttpError(404, "Group not found.");
  return m;
}

export function groupMembers(groupId: string): (PublicUser & { role: string; joinedAt: number })[] {
  return q<UserRow & { role: string; joined_at: number }>(
    `SELECT u.id, u.name, u.avatar_url, u.is_demo, m.role, m.joined_at
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = ? ORDER BY m.role = 'owner' DESC, m.joined_at`,
    groupId,
  ).map((r) => ({ ...toPublicUser(r), role: r.role, joinedAt: r.joined_at }));
}

export function userGroupIds(userId: string): string[] {
  return q<{ group_id: string }>("SELECT group_id FROM memberships WHERE user_id = ?", userId).map((r) => r.group_id);
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

function summary(g: GroupRow): GroupSummary {
  const members = groupMembers(g.id);
  const next = one<{ id: string; title: string; starts_at: number; status: HangoutStatus }>(
    `SELECT id, title, starts_at, status FROM hangouts WHERE group_id = ? AND status IN ('planning','live')
      ORDER BY status = 'live' DESC, starts_at LIMIT 1`,
    g.id,
  );
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

export function listGroups(userId: string): GroupSummary[] {
  return q<GroupRow>(
    `SELECT g.*, m.role FROM groups g JOIN memberships m ON m.group_id = g.id
      WHERE m.user_id = ? ORDER BY g.created_at DESC`,
    userId,
  ).map(summary);
}

export function upcomingForUser(userId: string): HangoutListItem[] {
  return q<HangoutRow>(
    `SELECT ${HANGOUT_COLS}, g.name AS group_name FROM hangouts h
       JOIN groups g ON g.id = h.group_id
       JOIN memberships m ON m.group_id = h.group_id AND m.user_id = ?
      WHERE h.status IN ('planning','live')
      ORDER BY h.status = 'live' DESC, h.starts_at`,
    userId,
  ).map(toListItem);
}

export function getGroup(userId: string, groupId: string): GroupDetail {
  const g = one<GroupRow>(
    "SELECT g.*, m.role FROM groups g JOIN memberships m ON m.group_id = g.id AND m.user_id = ? WHERE g.id = ?",
    userId,
    groupId,
  );
  if (!g) throw new HttpError(404, "Group not found.");
  const hangouts = q<HangoutRow>(
    `SELECT ${HANGOUT_COLS} FROM hangouts h WHERE h.group_id = ?
      ORDER BY CASE h.status WHEN 'live' THEN 0 WHEN 'planning' THEN 1 ELSE 2 END,
               CASE WHEN h.status IN ('planning','live') THEN h.starts_at ELSE -h.starts_at END`,
    groupId,
  ).map(toListItem);
  return { ...summary(g), inviteCode: g.invite_code, ownerId: g.owner_id, createdAt: g.created_at, hangouts };
}

export function createGroup(userId: string, input: { name: string; description: string | null; imageUrl: string | null; emoji: string | null }) {
  const id = newId();
  tx(() => {
    run(
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
    run("INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?,?, 'owner', ?)", id, userId, now());
  });
  return id;
}

export function updateGroup(
  userId: string,
  groupId: string,
  patch: { name?: string; description?: string | null; imageUrl?: string | null; emoji?: string | null },
) {
  const m = assertMember(userId, groupId);
  if (m.role !== "owner") throw new HttpError(403, "Only the group owner can edit the group.");
  if (patch.name !== undefined) run("UPDATE groups SET name = ? WHERE id = ?", patch.name, groupId);
  if (patch.description !== undefined) run("UPDATE groups SET description = ? WHERE id = ?", patch.description, groupId);
  if (patch.imageUrl !== undefined) run("UPDATE groups SET image_url = ? WHERE id = ?", patch.imageUrl, groupId);
  if (patch.emoji !== undefined) run("UPDATE groups SET emoji = ? WHERE id = ?", patch.emoji, groupId);
  publish(`group:${groupId}`, { type: "group.updated", groupId });
}

export function regenerateInvite(userId: string, groupId: string) {
  const m = assertMember(userId, groupId);
  if (m.role !== "owner") throw new HttpError(403, "Only the group owner can reset the invite link.");
  const code = inviteCode();
  run("UPDATE groups SET invite_code = ? WHERE id = ?", code, groupId);
  publish(`group:${groupId}`, { type: "group.updated", groupId });
  return code;
}

export function previewInvite(code: string) {
  const g = one<{ id: string; name: string; description: string | null; image_url: string | null; emoji: string | null }>(
    "SELECT id, name, description, image_url, emoji FROM groups WHERE invite_code = ?",
    code.toUpperCase().trim(),
  );
  if (!g) throw new HttpError(404, "This invite link is invalid or has been reset.");
  const members = groupMembers(g.id);
  return { id: g.id, name: g.name, description: g.description, imageUrl: g.image_url, emoji: g.emoji, memberCount: members.length, members: members.slice(0, 6) };
}

export function joinByCode(userId: string, code: string) {
  const g = previewInvite(code);
  if (!membership(userId, g.id)) {
    tx(() => {
      run("INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?,?, 'member', ?)", g.id, userId, now());
      // Join any hangouts still being planned so the newcomer can weigh in.
      const open = q<{ id: string }>("SELECT id FROM hangouts WHERE group_id = ? AND status = 'planning'", g.id);
      for (const h of open)
        run("INSERT OR IGNORE INTO participants (hangout_id, user_id, rsvp, updated_at) VALUES (?,?, 'going', ?)", h.id, userId, now());
    });
    publish(`group:${g.id}`, { type: "group.members", groupId: g.id });
  }
  return g.id;
}

function removeFromGroup(groupId: string, userId: string) {
  tx(() => {
    run("DELETE FROM memberships WHERE group_id = ? AND user_id = ?", groupId, userId);
    const active = q<{ id: string }>("SELECT id FROM hangouts WHERE group_id = ? AND status IN ('planning','live')", groupId);
    for (const h of active) {
      run("DELETE FROM participants WHERE hangout_id = ? AND user_id = ?", h.id, userId);
      run("DELETE FROM votes WHERE hangout_id = ? AND user_id = ?", h.id, userId);
      run("DELETE FROM location_shares WHERE hangout_id = ? AND user_id = ?", h.id, userId);
      publish(`hangout:${h.id}`, { type: "hangout.updated", hangoutId: h.id });
    }
  });
}

export function leaveGroup(userId: string, groupId: string) {
  assertMember(userId, groupId);
  removeFromGroup(groupId, userId);
  const remaining = q<{ user_id: string }>("SELECT user_id FROM memberships WHERE group_id = ? ORDER BY joined_at", groupId);
  if (!remaining.length) {
    run("DELETE FROM groups WHERE id = ?", groupId);
    return;
  }
  const owner = one<{ owner_id: string }>("SELECT owner_id FROM groups WHERE id = ?", groupId);
  if (owner?.owner_id === userId) {
    // Hand ownership to the longest-standing member.
    const heir = remaining[0].user_id;
    run("UPDATE groups SET owner_id = ? WHERE id = ?", heir, groupId);
    run("UPDATE memberships SET role = 'owner' WHERE group_id = ? AND user_id = ?", groupId, heir);
  }
  publish(`group:${groupId}`, { type: "group.members", groupId });
}

export function removeMember(userId: string, groupId: string, memberId: string) {
  const m = assertMember(userId, groupId);
  if (m.role !== "owner") throw new HttpError(403, "Only the group owner can remove members.");
  if (memberId === userId) throw new HttpError(400, "Use “Leave group” to remove yourself.");
  if (!membership(memberId, groupId)) throw new HttpError(404, "That person isn't in this group.");
  removeFromGroup(groupId, memberId);
  publish(`group:${groupId}`, { type: "group.members", groupId });
  publish(`user:${memberId}`, { type: "group.removed", groupId });
}
