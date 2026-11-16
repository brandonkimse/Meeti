import "server-only";
import type { LatLng, Mode } from "@/lib/types";
import { HttpError } from "../auth";
import { now, one, run } from "../db";
import { publish } from "../realtime";
import { routeEta } from "../geo/routing";
import { haversine, modelSeconds } from "../geo/util";
import { accessHangout, hangoutRow, toShare, type HangoutRow, type ShareRow } from "./hangouts";

/**
 * Opt-in live location sharing, scoped to a single hangout.
 * - Sharing starts only after an explicit consent call for that hangout.
 * - Coordinates are visible only to participants of that hangout, only while active.
 * - Sharing expires automatically at the hangout's end, and coordinates are wiped
 *   when the hangout completes.
 */

const ARRIVAL_RADIUS_M = 90;
const ETA_REFRESH_MS = 20_000;

function shareRow(hangoutId: string, userId: string) {
  return one<ShareRow>("SELECT * FROM location_shares WHERE hangout_id = ? AND user_id = ?", hangoutId, userId);
}

function emit(hangoutId: string, userId: string) {
  const r = shareRow(hangoutId, userId);
  if (r) publish(`hangout:${hangoutId}`, { type: "location", hangoutId, share: toShare(r) });
}

function requireParticipant(h: HangoutRow, userId: string) {
  const p = one<{ mode: Mode | null; origin_lat: number | null; origin_lng: number | null }>(
    "SELECT mode, origin_lat, origin_lng FROM participants WHERE hangout_id = ? AND user_id = ?",
    h.id,
    userId,
  );
  if (!p) throw new HttpError(403, "You're not part of this hangout.");
  return p;
}

export function startSharing(userId: string, hangoutId: string) {
  const { h } = accessHangout(userId, hangoutId);
  if (h.status !== "live") throw new HttpError(409, "Live sharing opens once the destination is locked in.");
  requireParticipant(h, userId);
  const t = now();
  run(
    `INSERT INTO location_shares (hangout_id, user_id, status, consented_at, expires_at) VALUES (?,?, 'active', ?, ?)
     ON CONFLICT(hangout_id, user_id) DO UPDATE SET status = 'active', consented_at = excluded.consented_at, expires_at = excluded.expires_at`,
    hangoutId,
    userId,
    t,
    h.ends_at,
  );
  emit(hangoutId, userId);
}

export function setSharingStatus(userId: string, hangoutId: string, status: "paused" | "active" | "stopped") {
  const { h } = accessHangout(userId, hangoutId);
  const r = shareRow(hangoutId, userId);
  if (!r) throw new HttpError(404, "You aren't sharing your location for this hangout.");
  if (status === "active") {
    if (h.status !== "live") throw new HttpError(409, "This hangout isn't live.");
    run("UPDATE location_shares SET status = 'active' WHERE hangout_id = ? AND user_id = ?", hangoutId, userId);
  } else if (status === "paused") {
    run("UPDATE location_shares SET status = 'paused' WHERE hangout_id = ? AND user_id = ?", hangoutId, userId);
  } else {
    // Stopping deletes the stored position entirely.
    run(
      "UPDATE location_shares SET status = 'stopped', lat = NULL, lng = NULL, accuracy = NULL, eta_s = NULL, distance_m = NULL WHERE hangout_id = ? AND user_id = ?",
      hangoutId,
      userId,
    );
  }
  emit(hangoutId, userId);
}

const inFlight = new Set<string>();

export async function updateLocation(userId: string, hangoutId: string, pos: LatLng & { accuracy?: number | null }) {
  const h = hangoutRow(hangoutId);
  if (h.status !== "live" || h.dest_lat == null || h.dest_lng == null) throw new HttpError(409, "This hangout isn't live.");
  const r = shareRow(hangoutId, userId);
  if (!r || r.status !== "active") throw new HttpError(403, "Location sharing is off for this hangout.");
  if (now() > r.expires_at) {
    setSharingStatus(userId, hangoutId, "stopped");
    throw new HttpError(410, "Location sharing has expired for this hangout.");
  }
  const p = requireParticipant(h, userId);
  const mode = p.mode ?? h.mode;
  const dest = { lat: h.dest_lat, lng: h.dest_lng };
  const t = now();
  const straight = haversine(pos, dest);
  const arrived = r.arrived_at ?? (straight <= Math.max(ARRIVAL_RADIUS_M, Math.min(pos.accuracy ?? 0, 150)) ? t : null);
  // "On the way" once they've clearly left their starting point (or jumped since the last fix).
  const moved = r.lat != null && r.lng != null ? haversine(pos, { lat: r.lat, lng: r.lng }) : 0;
  const fromStart = p.origin_lat != null && p.origin_lng != null ? haversine(pos, { lat: p.origin_lat, lng: p.origin_lng }) : 0;
  const startedMoving = r.started_moving_at ?? (moved > 60 || fromStart > 120 ? t : null);

  // Cheap interim ETA: scale the last routed ETA by remaining straight-line distance.
  let eta = r.eta_s;
  let dist = r.distance_m;
  let source = r.eta_source;
  if (arrived) {
    eta = 0;
    dist = straight;
  } else if (eta != null && r.lat != null && r.lng != null) {
    const prevStraight = haversine({ lat: r.lat, lng: r.lng }, dest);
    const ratio = prevStraight > 0 ? straight / prevStraight : 1;
    eta = Math.max(0, eta * ratio);
    dist = dist != null ? dist * ratio : null;
  } else {
    const m = modelSeconds(pos, dest, mode);
    eta = m.seconds;
    dist = m.meters;
    source = "model";
  }

  run(
    `UPDATE location_shares SET lat = ?, lng = ?, accuracy = ?, updated_at = ?, eta_s = ?, distance_m = ?, eta_source = ?,
       arrived_at = ?, started_moving_at = ? WHERE hangout_id = ? AND user_id = ?`,
    pos.lat,
    pos.lng,
    pos.accuracy ?? null,
    t,
    eta,
    dist,
    source,
    arrived,
    startedMoving,
    hangoutId,
    userId,
  );
  emit(hangoutId, userId);

  // Periodically refresh with a real routed ETA.
  const k = `${hangoutId}:${userId}`;
  if (!arrived && !inFlight.has(k) && t - (r.eta_computed_at ?? 0) > ETA_REFRESH_MS) {
    inFlight.add(k);
    routeEta(pos, dest, mode)
      .then((leg) => {
        if (leg.seconds == null) return;
        run(
          "UPDATE location_shares SET eta_s = ?, distance_m = ?, eta_source = ?, eta_computed_at = ? WHERE hangout_id = ? AND user_id = ? AND arrived_at IS NULL",
          leg.seconds,
          leg.meters,
          leg.source,
          now(),
          hangoutId,
          userId,
        );
        emit(hangoutId, userId);
      })
      .catch(() => {})
      .finally(() => inFlight.delete(k));
  }
}

export function markArrived(userId: string, hangoutId: string) {
  const { h } = accessHangout(userId, hangoutId);
  if (h.status !== "live") throw new HttpError(409, "This hangout isn't live.");
  requireParticipant(h, userId);
  const t = now();
  run(
    `INSERT INTO location_shares (hangout_id, user_id, status, consented_at, expires_at, arrived_at, eta_s) VALUES (?,?, 'stopped', ?, ?, ?, 0)
     ON CONFLICT(hangout_id, user_id) DO UPDATE SET arrived_at = COALESCE(arrived_at, excluded.arrived_at), eta_s = 0`,
    hangoutId,
    userId,
    t,
    h.ends_at,
    t,
  );
  emit(hangoutId, userId);
}
