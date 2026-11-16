import "server-only";
import { createHash } from "node:crypto";
import type {
  Category,
  HangoutDetail,
  HangoutStatus,
  LiveShare,
  Mode,
  Participant,
  PlaceCandidate,
  RecommendationSet,
  Suggestion,
  TravelSummary,
} from "@/lib/types";
import { HttpError } from "../auth";
import { providerStatus } from "../config";
import { newId, now, one, q, run, tx } from "../db";
import { publish } from "../realtime";
import { recommend } from "../geo/recommend";
import { travelMatrix, type Origin } from "../geo/routing";
import { summarize } from "../geo/util";
import { assertMember, toPublicUser } from "./groups";

export type HangoutRow = {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  starts_at: number;
  ends_at: number;
  mode: Mode;
  category: Category | null;
  status: HangoutStatus;
  final_suggestion_id: string | null;
  dest_name: string | null;
  dest_address: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  dest_image_url: string | null;
  poll_closes_at: number | null;
  recommendations_json: string | null;
  recommendations_key: string | null;
  created_at: number;
  finalized_at: number | null;
  completed_at: number | null;
};

type ParticipantRow = {
  user_id: string;
  rsvp: Participant["rsvp"];
  origin_lat: number | null;
  origin_lng: number | null;
  origin_label: string | null;
  origin_source: "gps" | "manual" | null;
  mode: Mode | null;
  name: string;
  avatar_url: string | null;
  is_demo: number;
};

type SuggestionRow = {
  id: string;
  added_by: string | null;
  source: "member" | "where2";
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: Category | null;
  image_url: string | null;
  rating: number | null;
  rating_count: number | null;
  external_id: string | null;
  travel_json: string | null;
  travel_key: string | null;
};

export type ShareRow = {
  hangout_id: string;
  user_id: string;
  status: LiveShare["status"];
  consented_at: number;
  expires_at: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  updated_at: number | null;
  eta_s: number | null;
  distance_m: number | null;
  eta_source: LiveShare["etaSource"];
  eta_computed_at: number | null;
  started_moving_at: number | null;
  arrived_at: number | null;
};

const topic = (id: string) => `hangout:${id}`;
const changed = (id: string, what = "hangout.updated") => publish(topic(id), { type: what, hangoutId: id });

export function hangoutRow(id: string): HangoutRow {
  const h = one<HangoutRow>("SELECT * FROM hangouts WHERE id = ?", id);
  if (!h) throw new HttpError(404, "Hangout not found.");
  return h;
}

/** Loads a hangout the user is allowed to see, applying lifecycle rules first. */
export function accessHangout(userId: string, id: string) {
  let h = hangoutRow(id);
  const m = assertMember(userId, h.group_id);
  if (h.status === "live" && now() > h.ends_at) {
    completeInternal(h.id);
    h = hangoutRow(id);
  }
  const canManage = h.created_by === userId || m.role === "owner";
  return { h, canManage };
}

export function toShare(r: ShareRow): LiveShare {
  const visible = r.status === "active";
  return {
    userId: r.user_id,
    status: r.status,
    // Coordinates are only exposed while sharing is active.
    lat: visible ? r.lat : null,
    lng: visible ? r.lng : null,
    accuracy: visible ? r.accuracy : null,
    updatedAt: r.updated_at,
    etaSeconds: visible ? r.eta_s : null,
    distanceMeters: visible ? r.distance_m : null,
    etaSource: r.eta_source,
    arrivedAt: r.arrived_at,
    startedMovingAt: r.started_moving_at,
    expiresAt: r.expires_at,
  };
}

function participantRows(hangoutId: string) {
  return q<ParticipantRow>(
    `SELECT p.user_id, p.rsvp, p.origin_lat, p.origin_lng, p.origin_label, p.origin_source, p.mode,
            u.name, u.avatar_url, u.is_demo
       FROM participants p JOIN users u ON u.id = p.user_id
      WHERE p.hangout_id = ? ORDER BY p.rowid`,
    hangoutId,
  );
}

export function originsFor(h: HangoutRow): Origin[] {
  return participantRows(h.id)
    .filter((p) => p.rsvp !== "declined" && p.origin_lat != null && p.origin_lng != null)
    .map((p) => ({ id: p.user_id, lat: p.origin_lat!, lng: p.origin_lng!, mode: p.mode ?? h.mode }));
}

export function originKey(origins: Origin[]): string {
  const s = origins
    .map((o) => `${o.id}:${o.lat.toFixed(4)},${o.lng.toFixed(4)}:${o.mode}`)
    .sort()
    .join("|");
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

export function getHangout(userId: string, id: string): HangoutDetail {
  const { h, canManage } = accessHangout(userId, id);
  const g = one<{ id: string; name: string; emoji: string | null; image_url: string | null }>(
    "SELECT id, name, emoji, image_url FROM groups WHERE id = ?",
    h.group_id,
  )!;
  const parts = participantRows(h.id);
  const participants: Participant[] = parts.map((p) => ({
    user: toPublicUser({ id: p.user_id, name: p.name, avatar_url: p.avatar_url, is_demo: p.is_demo }),
    rsvp: p.rsvp,
    mode: p.mode ?? h.mode,
    origin:
      p.origin_lat != null && p.origin_lng != null
        ? { lat: p.origin_lat, lng: p.origin_lng, label: p.origin_label, source: p.origin_source }
        : null,
  }));

  const key = originKey(originsFor(h));
  const votes = q<{ user_id: string; suggestion_id: string }>("SELECT user_id, suggestion_id FROM votes WHERE hangout_id = ?", h.id);
  const suggestions: Suggestion[] = q<SuggestionRow>("SELECT * FROM suggestions WHERE hangout_id = ? ORDER BY created_at", h.id).map(
    (s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      category: s.category,
      imageUrl: s.image_url,
      rating: s.rating,
      ratingCount: s.rating_count,
      source: s.source,
      addedBy: s.added_by,
      travel: s.travel_json ? (JSON.parse(s.travel_json) as TravelSummary) : null,
      travelStale: s.travel_key !== key,
      votes: votes.filter((v) => v.suggestion_id === s.id).map((v) => v.user_id),
    }),
  );

  const recs = h.recommendations_json ? (JSON.parse(h.recommendations_json) as RecommendationSet) : null;
  const memberIds = new Set(parts.map((p) => p.user_id));
  const shares = q<ShareRow>("SELECT * FROM location_shares WHERE hangout_id = ?", h.id)
    .filter((s) => memberIds.has(s.user_id))
    .map(toShare);

  return {
    id: h.id,
    title: h.title,
    startsAt: h.starts_at,
    endsAt: h.ends_at,
    status: h.status,
    mode: h.mode,
    category: h.category,
    createdBy: h.created_by,
    canManage,
    pollClosesAt: h.poll_closes_at,
    finalizedAt: h.finalized_at,
    completedAt: h.completed_at,
    group: { id: g.id, name: g.name, emoji: g.emoji, imageUrl: g.image_url },
    destination:
      h.dest_lat != null && h.dest_lng != null
        ? {
            lat: h.dest_lat,
            lng: h.dest_lng,
            name: h.dest_name ?? "Meeting spot",
            address: h.dest_address,
            imageUrl: h.dest_image_url,
            suggestionId: h.final_suggestion_id,
          }
        : null,
    participants,
    suggestions,
    recommendations: recs,
    recommendationsStale: !!recs && recs.key !== key,
    shares,
    me: { id: userId, share: shares.find((s) => s.userId === userId) ?? null },
    providers: providerStatus(),
  };
}

export function createHangout(
  userId: string,
  groupId: string,
  input: { title: string; startsAt: number; durationMin: number; mode: Mode; category: Category | null; pollClosesAt: number | null },
) {
  assertMember(userId, groupId);
  const id = newId();
  const t = now();
  tx(() => {
    run(
      `INSERT INTO hangouts (id, group_id, created_by, title, starts_at, ends_at, mode, category, status, poll_closes_at, created_at)
       VALUES (?,?,?,?,?,?,?,?, 'planning', ?, ?)`,
      id,
      groupId,
      userId,
      input.title,
      input.startsAt,
      input.startsAt + input.durationMin * 60_000,
      input.mode,
      input.category,
      input.pollClosesAt,
      t,
    );
    const members = q<{ user_id: string }>("SELECT user_id FROM memberships WHERE group_id = ?", groupId);
    for (const m of members)
      run("INSERT INTO participants (hangout_id, user_id, rsvp, updated_at) VALUES (?,?, 'going', ?)", id, m.user_id, t);
  });
  publish(`group:${groupId}`, { type: "group.hangouts", groupId });
  return id;
}

function requirePlanning(h: HangoutRow) {
  if (h.status !== "planning") throw new HttpError(409, "Planning for this hangout is closed.");
}

export function setOrigin(
  userId: string,
  id: string,
  input: { lat: number; lng: number; label: string | null; source: "gps" | "manual"; mode: Mode | null } | null,
) {
  const { h } = accessHangout(userId, id);
  requirePlanning(h);
  if (input)
    run(
      `UPDATE participants SET origin_lat = ?, origin_lng = ?, origin_label = ?, origin_source = ?, mode = COALESCE(?, mode), updated_at = ?
        WHERE hangout_id = ? AND user_id = ?`,
      input.lat,
      input.lng,
      input.label,
      input.source,
      input.mode,
      now(),
      id,
      userId,
    );
  else
    run(
      `UPDATE participants SET origin_lat = NULL, origin_lng = NULL, origin_label = NULL, origin_source = NULL, updated_at = ?
        WHERE hangout_id = ? AND user_id = ?`,
      now(),
      id,
      userId,
    );
  changed(id);
  void refreshTravel(id);
}

export function setParticipation(userId: string, id: string, input: { rsvp?: Participant["rsvp"]; mode?: Mode }) {
  const { h } = accessHangout(userId, id);
  if (input.rsvp) run("UPDATE participants SET rsvp = ?, updated_at = ? WHERE hangout_id = ? AND user_id = ?", input.rsvp, now(), id, userId);
  if (input.mode) {
    requirePlanning(h);
    run("UPDATE participants SET mode = ?, updated_at = ? WHERE hangout_id = ? AND user_id = ?", input.mode, now(), id, userId);
  }
  changed(id);
  if (h.status === "planning") void refreshTravel(id);
}

async function travelFor(h: HangoutRow, places: { lat: number; lng: number }[]): Promise<TravelSummary[]> {
  const origins = originsFor(h);
  const legs = await travelMatrix(origins, places, h.starts_at);
  return places.map((_, j) =>
    summarize(
      origins.map((o) => {
        const l = legs.get(o.id)?.[j];
        return { userId: o.id, mode: o.mode, seconds: l?.seconds ?? null, meters: l?.meters ?? null, source: l?.source ?? "model" };
      }),
    ),
  );
}

/** Hangouts with a refresh in flight -> whether another run was requested meanwhile. */
const refreshing = new Map<string, boolean>();

/** Recompute per-member travel times for every suggestion whose inputs changed. */
export async function refreshTravel(id: string) {
  if (refreshing.has(id)) {
    refreshing.set(id, true);
    return;
  }
  refreshing.set(id, false);
  try {
    // Small debounce so a burst of origin edits triggers one recompute.
    await new Promise((r) => setTimeout(r, 300));
    const h = hangoutRow(id);
    const key = originKey(originsFor(h));
    const stale = q<SuggestionRow>("SELECT * FROM suggestions WHERE hangout_id = ? AND (travel_key IS NULL OR travel_key != ?)", id, key);
    if (!stale.length) return;
    const travel = await travelFor(h, stale);
    stale.forEach((s, i) => run("UPDATE suggestions SET travel_json = ?, travel_key = ? WHERE id = ?", JSON.stringify(travel[i]), key, s.id));
    changed(id);
  } catch (e) {
    console.warn("[where2] travel refresh failed:", (e as Error).message);
  } finally {
    const again = refreshing.get(id);
    refreshing.delete(id);
    if (again) void refreshTravel(id);
  }
}

export async function addSuggestion(userId: string, id: string, place: PlaceCandidate, source: "member" | "where2", opts: { deferTravel?: boolean } = {}) {
  const { h } = accessHangout(userId, id);
  requirePlanning(h);
  const existing = one<{ id: string }>(
    "SELECT id FROM suggestions WHERE hangout_id = ? AND (external_id = ? OR (abs(lat - ?) < 0.0003 AND abs(lng - ?) < 0.0003 AND name = ?))",
    id,
    place.externalId,
    place.lat,
    place.lng,
    place.name,
  );
  if (existing) return existing.id;
  const count = one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestions WHERE hangout_id = ?", id)!.n;
  if (count >= 12) throw new HttpError(400, "That's plenty of options! Remove one before adding another.");

  const sid = newId();
  const key = originKey(originsFor(h));
  let travel: TravelSummary | null = null;
  if (!opts.deferTravel)
    try {
      [travel] = await travelFor(h, [place]);
    } catch (e) {
      console.warn("[where2] travel for new suggestion failed:", (e as Error).message);
    }
  run(
    `INSERT INTO suggestions (id, hangout_id, added_by, source, name, address, lat, lng, category, image_url, rating, rating_count, external_id, travel_json, travel_key, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    sid,
    id,
    userId,
    source,
    place.name,
    place.address,
    place.lat,
    place.lng,
    place.category,
    place.imageUrl,
    place.rating,
    place.ratingCount,
    place.externalId,
    travel ? JSON.stringify(travel) : null,
    travel ? key : null,
    now(),
  );
  changed(id);
  if (!travel) void refreshTravel(id);
  return sid;
}

export function removeSuggestion(userId: string, id: string, suggestionId: string) {
  const { h, canManage } = accessHangout(userId, id);
  requirePlanning(h);
  const s = one<{ added_by: string | null }>("SELECT added_by FROM suggestions WHERE id = ? AND hangout_id = ?", suggestionId, id);
  if (!s) throw new HttpError(404, "Suggestion not found.");
  if (s.added_by !== userId && !canManage) throw new HttpError(403, "Only the person who added this (or the host) can remove it.");
  run("DELETE FROM suggestions WHERE id = ?", suggestionId);
  changed(id);
}

export function vote(userId: string, id: string, suggestionId: string | null) {
  const { h } = accessHangout(userId, id);
  requirePlanning(h);
  if (h.poll_closes_at && now() > h.poll_closes_at) throw new HttpError(409, "Voting has closed.");
  if (suggestionId) {
    if (!one("SELECT 1 FROM suggestions WHERE id = ? AND hangout_id = ?", suggestionId, id)) throw new HttpError(404, "Option not found.");
    run(
      `INSERT INTO votes (hangout_id, user_id, suggestion_id, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(hangout_id, user_id) DO UPDATE SET suggestion_id = excluded.suggestion_id, updated_at = excluded.updated_at`,
      id,
      userId,
      suggestionId,
      now(),
    );
  } else {
    run("DELETE FROM votes WHERE hangout_id = ? AND user_id = ?", id, userId);
  }
  publish(topic(id), { type: "hangout.votes", hangoutId: id });
}

export async function generateRecommendations(userId: string, id: string, category: Category): Promise<RecommendationSet> {
  const { h } = accessHangout(userId, id);
  requirePlanning(h);
  const origins = originsFor(h);
  if (!origins.length) throw new HttpError(400, "Add at least one starting point first. Where2 needs to know where people are coming from.");
  let result;
  try {
    result = await recommend(origins, category, h.starts_at);
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
  const set: RecommendationSet = { ...result, category, key: originKey(origins), generatedAt: now() };
  run("UPDATE hangouts SET recommendations_json = ?, recommendations_key = ?, category = ? WHERE id = ?", JSON.stringify(set), set.key, category, id);
  changed(id);
  return set;
}

export function finalize(userId: string, id: string, suggestionId: string) {
  const { h, canManage } = accessHangout(userId, id);
  requirePlanning(h);
  if (!canManage) throw new HttpError(403, "Only the host can lock in the destination.");
  const s = one<SuggestionRow>("SELECT * FROM suggestions WHERE id = ? AND hangout_id = ?", suggestionId, id);
  if (!s) throw new HttpError(404, "Option not found.");
  const t = now();
  run(
    `UPDATE hangouts SET status = 'live', final_suggestion_id = ?, dest_name = ?, dest_address = ?, dest_lat = ?, dest_lng = ?, dest_image_url = ?,
       finalized_at = ?, poll_closes_at = COALESCE(poll_closes_at, ?), ends_at = MAX(ends_at, ?) WHERE id = ?`,
    s.id,
    s.name,
    s.address,
    s.lat,
    s.lng,
    s.image_url,
    t,
    t,
    t + 2 * 3600_000,
    id,
  );
  changed(id, "hangout.finalized");
  publish(`group:${h.group_id}`, { type: "group.hangouts", groupId: h.group_id });
}

function completeInternal(id: string) {
  const h = hangoutRow(id);
  tx(() => {
    run("UPDATE hangouts SET status = 'completed', completed_at = ? WHERE id = ? AND status IN ('live','planning')", now(), id);
    // Location sharing ends with the hangout: wipe coordinates, keep arrival facts for the recap.
    run(
      "UPDATE location_shares SET status = 'expired', lat = NULL, lng = NULL, accuracy = NULL, eta_s = NULL, distance_m = NULL WHERE hangout_id = ?",
      id,
    );
  });
  changed(id, "hangout.completed");
  publish(`group:${h.group_id}`, { type: "group.hangouts", groupId: h.group_id });
}

export function complete(userId: string, id: string) {
  const { h } = accessHangout(userId, id);
  if (h.status !== "live") throw new HttpError(409, "Only a live hangout can be wrapped up.");
  completeInternal(id);
}

export function cancelHangout(userId: string, id: string) {
  const { h, canManage } = accessHangout(userId, id);
  if (!canManage) throw new HttpError(403, "Only the host can cancel this hangout.");
  run("DELETE FROM hangouts WHERE id = ?", id);
  changed(id, "hangout.deleted");
  publish(`group:${h.group_id}`, { type: "group.hangouts", groupId: h.group_id });
}

export function updateHangout(userId: string, id: string, patch: { title?: string; startsAt?: number; mode?: Mode }) {
  const { h, canManage } = accessHangout(userId, id);
  if (!canManage) throw new HttpError(403, "Only the host can edit the plan.");
  requirePlanning(h);
  if (patch.title) run("UPDATE hangouts SET title = ? WHERE id = ?", patch.title, id);
  if (patch.startsAt) run("UPDATE hangouts SET starts_at = ?, ends_at = ? + (ends_at - starts_at) WHERE id = ?", patch.startsAt, patch.startsAt, id);
  if (patch.mode) run("UPDATE hangouts SET mode = ? WHERE id = ?", patch.mode, id);
  changed(id);
  publish(`group:${h.group_id}`, { type: "group.hangouts", groupId: h.group_id });
  if (patch.mode) void refreshTravel(id);
}
