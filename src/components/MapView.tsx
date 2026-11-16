"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { LatLng } from "@/lib/types";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  html: string;
  size: [number, number];
  anchor?: [number, number];
  z?: number;
  moving?: boolean;
  onClick?: () => void;
  title?: string;
};

export type MapLine = { id: string; points: LatLng[]; color: string; dashed?: boolean; weight?: number; opacity?: number };

// Default: OpenStreetMap's standard tiles (fine for development and light use).
// For production traffic, point these at a tile provider (MapTiler, Stadia, etc.).
const CUSTOM_TILES = !!process.env.NEXT_PUBLIC_MAP_TILE_URL;
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Thin imperative wrapper around Leaflet. Markers are diffed by id so moving
 * friends glide to their new position instead of being re-created.
 */
export function MapView({
  markers,
  lines = [],
  fitKey,
  fitPoints,
  className = "",
  padding = [48, 48],
  paddingBottom = 0,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  /** Change this to re-fit the view to `fitPoints`. */
  fitKey: string;
  fitPoints: LatLng[];
  className?: string;
  padding?: [number, number];
  paddingBottom?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const markerLayer = useRef(new Map<string, { m: Leaflet.Marker; html: string }>());
  const lineLayer = useRef(new Map<string, Leaflet.Polyline>());
  const ready = useRef<Promise<void> | null>(null);
  const latest = useRef({ fitPoints, padding, paddingBottom });
  useEffect(() => {
    latest.current = { fitPoints, padding, paddingBottom };
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    const markersById = markerLayer.current;
    const linesById = lineLayer.current;
    ready.current = (async () => {
      const lib = await import("leaflet");
      if (cancelled || !el.current) return;
      L.current = lib;
      const m = lib.map(el.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25 });
      lib.control.zoom({ position: "topright" }).addTo(m);
      lib.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, className: CUSTOM_TILES ? "" : "w2-tiles-soft" }).addTo(m);
      m.setView([37.77, -122.42], 12);
      // Disable marker glide while zooming so markers don't drift.
      m.on("zoomstart", () => el.current?.classList.remove("w2-animate"));
      m.on("zoomend", () => setTimeout(() => el.current?.classList.add("w2-animate"), 50));
      el.current.classList.add("w2-animate");
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markersById.clear();
      linesById.clear();
    };
  }, []);

  // Sync markers and lines.
  useEffect(() => {
    ready.current?.then(() => {
      const m = map.current;
      const lib = L.current;
      if (!m || !lib) return;
      const seen = new Set<string>();
      for (const mk of markers) {
        seen.add(mk.id);
        const existing = markerLayer.current.get(mk.id);
        if (existing) {
          const cur = existing.m.getLatLng();
          if (cur.lat !== mk.lat || cur.lng !== mk.lng) existing.m.setLatLng([mk.lat, mk.lng]);
          if (existing.html !== mk.html) {
            existing.m.setIcon(icon(lib, mk));
            existing.html = mk.html;
          }
          existing.m.setZIndexOffset(mk.z ?? 0);
          existing.m.off("click");
          if (mk.onClick) existing.m.on("click", mk.onClick);
        } else {
          const marker = lib.marker([mk.lat, mk.lng], { icon: icon(lib, mk), zIndexOffset: mk.z ?? 0, title: mk.title, keyboard: !!mk.onClick }).addTo(m);
          if (mk.onClick) marker.on("click", mk.onClick);
          markerLayer.current.set(mk.id, { m: marker, html: mk.html });
        }
      }
      for (const [id, { m: marker }] of markerLayer.current)
        if (!seen.has(id)) {
          marker.remove();
          markerLayer.current.delete(id);
        }

      const seenLines = new Set<string>();
      for (const ln of lines) {
        seenLines.add(ln.id);
        const pts = ln.points.map((p) => [p.lat, p.lng] as [number, number]);
        const style = { color: ln.color, weight: ln.weight ?? 3, opacity: ln.opacity ?? 0.8, dashArray: ln.dashed ? "6 8" : undefined, lineCap: "round" as const };
        const existing = lineLayer.current.get(ln.id);
        if (existing) {
          existing.setLatLngs(pts);
          existing.setStyle(style);
        } else lineLayer.current.set(ln.id, lib.polyline(pts, style).addTo(m));
      }
      for (const [id, l] of lineLayer.current)
        if (!seenLines.has(id)) {
          l.remove();
          lineLayer.current.delete(id);
        }
    });
  }, [markers, lines]);

  // Fit bounds when asked.
  useEffect(() => {
    ready.current?.then(() => {
      const m = map.current;
      const lib = L.current;
      const { fitPoints: pts, padding: pad, paddingBottom: pb } = latest.current;
      if (!m || !lib || !pts.length) return;
      m.invalidateSize();
      if (pts.length === 1) m.setView([pts[0].lat, pts[0].lng], 15, { animate: true });
      else
        m.fitBounds(lib.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), {
          paddingTopLeft: pad,
          paddingBottomRight: [pad[0], pad[1] + pb],
          maxZoom: 16,
          animate: true,
        });
    });
  }, [fitKey]);

  // Keep the map sized correctly in responsive layouts.
  useEffect(() => {
    if (!el.current) return;
    const ro = new ResizeObserver(() => map.current?.invalidateSize());
    ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  return <div ref={el} className={`h-full w-full ${className}`} />;
}

function icon(lib: typeof Leaflet, mk: MapMarker) {
  return lib.divIcon({
    html: mk.html,
    className: `w2-marker${mk.moving ? " w2-moving" : ""}`,
    iconSize: mk.size,
    iconAnchor: mk.anchor ?? [mk.size[0] / 2, mk.size[1] / 2],
  });
}

/* ---------- Marker HTML helpers ---------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function avatarPinHtml(opts: { name: string; avatarUrl: string | null; bg: string; badge?: string | null; pulse?: boolean; dim?: boolean; ring?: string }) {
  const initials = opts.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const inner = opts.avatarUrl ? `<img src="${esc(opts.avatarUrl)}" alt=""/>` : esc(initials);
  return `<div class="w2-pin-wrap" style="opacity:${opts.dim ? 0.55 : 1}">
    <div class="w2-pin-avatar ${opts.pulse ? "w2-pulse" : ""}" style="background:${opts.bg};${opts.ring ? `border-color:${opts.ring}` : ""}">${inner}</div>
    ${opts.badge ? `<span class="w2-pin-badge">${esc(opts.badge)}</span>` : ""}
  </div>`;
}

export function destPinHtml(emoji: string) {
  return `<div class="w2-dest">${esc(emoji)}</div>`;
}

export function numberPinHtml(n: number | string, opts: { active?: boolean; rec?: boolean } = {}) {
  return `<div class="w2-num" data-active="${!!opts.active}" data-rec="${!!opts.rec}">${esc(String(n))}</div>`;
}
