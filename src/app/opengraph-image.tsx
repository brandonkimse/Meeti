import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Link preview (KakaoTalk, iMessage, Slack, X…): a still of the homepage hero,
 * with friends' travel times meeting at the fairest pick. Generated at build time.
 * Applies to every page, including shared plan links.
 */
export const alt = "Meeti: “Where should we meet?” Solved. Friends' travel times meeting at the fairest pick.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#17141f";
const MUTED = "#6f6a7d";
const VOLT = "#d4ff3f";
const VOLT_INK = "#3b4a00";
const PAPER = "#f6f4ef";

// Same friends as the homepage hero (positions in % of the map); the bottom two
// sit a little higher so the "Fairest pick" card doesn't cover them.
const FRIENDS = [
  { x: 14, y: 20, c: "#ff7a59", i: "MP", t: "14 min" },
  { x: 84, y: 16, c: "#8b7cff", i: "LM", t: "16 min" },
  { x: 13, y: 64, c: "#4cb8f5", i: "PS", t: "13 min" },
  { x: 86, y: 62, c: "#2fd09a", i: "JB", t: "15 min" },
];
const MAP = 518;

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

function Mark({ size: s }: { size: number }) {
  return (
    <div style={{ width: s, height: s, borderRadius: s * 0.36, background: VOLT, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={s * 0.58} height={s * 0.58} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round">
        <path d="M4 18 C 7 12, 9 12, 12 12 C 15 12, 17 12, 20 18" />
        <circle cx="12" cy="7" r="2.6" fill={INK} stroke="none" />
      </svg>
    </div>
  );
}

function HeroMap() {
  return (
    <div
      style={{
        position: "relative",
        width: MAP,
        height: MAP,
        borderRadius: 40,
        overflow: "hidden",
        background: "#e8eee9",
        display: "flex",
        boxShadow: "0 24px 48px -16px rgba(23,20,31,0.35)",
      }}
    >
      {/* City blocks, river, park and the dashed routes to the meeting point. */}
      <svg width={MAP} height={MAP} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          <pattern id="blocks" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
            <rect width="12" height="12" fill="#e8eee9" />
            <rect x="1.4" y="1.4" width="9.2" height="9.2" rx="1.6" fill="#f6f7f2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#blocks)" />
        <path d="M-5 60 C 30 52, 55 70, 105 48" stroke="#cfe3f5" strokeWidth="6" fill="none" />
        <ellipse cx="72" cy="40" rx="11" ry="8" fill="#cdeccf" />
        {FRIENDS.map((f, i) => (
          <path
            key={i}
            d={`M${f.x} ${f.y} Q ${(f.x + 50) / 2 + (i % 2 ? 8 : -8)} ${(f.y + 50) / 2}, 50 50`}
            stroke={INK}
            strokeWidth="0.6"
            strokeDasharray="1.6 1.6"
            fill="none"
            opacity="0.55"
          />
        ))}
      </svg>

      {FRIENDS.map((f, i) => (
        <div
          key={i}
          style={{ position: "absolute", left: (f.x / 100) * MAP - 40, top: (f.y / 100) * MAP - 30, width: 80, display: "flex", flexDirection: "column", alignItems: "center" }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              border: "4px solid white",
              background: f.c,
              color: "white",
              fontFamily: "Figtree",
              fontWeight: 700,
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 18px -6px rgba(23,20,31,0.4)",
            }}
          >
            {f.i}
          </div>
          <div style={{ marginTop: 6, padding: "3px 10px", borderRadius: 999, background: "white", fontFamily: "Figtree", fontWeight: 700, fontSize: 15, color: INK, display: "flex" }}>{f.t}</div>
        </div>
      ))}

      {/* The meeting point. */}
      <div
        style={{
          position: "absolute",
          left: MAP / 2 - 36,
          top: MAP / 2 - 36,
          width: 72,
          height: 72,
          borderRadius: 22,
          background: INK,
          border: `4px solid ${VOLT}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 12px 28px -6px rgba(23,20,31,0.55)",
        }}
      >
        {/* A noodle bowl, drawn so the image doesn't depend on an emoji font. */}
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={VOLT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18a9 9 0 0 1-18 0z" fill={VOLT} />
          <path d="M14 3l-3 8M19 4l-6 7" />
        </svg>
      </div>

      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 18,
          padding: "14px 16px",
          borderRadius: 20,
          background: "rgba(255,255,255,0.96)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: "Figtree", fontWeight: 700, fontSize: 14, letterSpacing: 1.5, color: MUTED }}>FAIREST PICK</div>
          <div style={{ fontFamily: "Bricolage", fontWeight: 700, fontSize: 24, color: INK }}>Noodle Bar, Hayes Valley</div>
        </div>
        <div style={{ padding: "8px 12px", borderRadius: 14, background: VOLT, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: "Bricolage", fontWeight: 800, fontSize: 28, lineHeight: 1, color: INK }}>96%</div>
          <div style={{ fontFamily: "Figtree", fontWeight: 700, fontSize: 13, color: VOLT_INK }}>fair</div>
        </div>
      </div>
    </div>
  );
}

export default async function Image() {
  const [bricolage800, bricolage700, figtree500, figtree700] = await Promise.all([
    font("bricolage-grotesque-latin-800-normal.woff"),
    font("bricolage-grotesque-latin-700-normal.woff"),
    font("figtree-latin-500-normal.woff"),
    font("figtree-latin-700-normal.woff"),
  ]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: PAPER, display: "flex", alignItems: "center", padding: "0 56px 0 72px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", paddingRight: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Mark size={46} />
            <div style={{ display: "flex", fontFamily: "Bricolage", fontWeight: 800, fontSize: 38, color: INK }}>
              Meet<span style={{ color: VOLT_INK }}>i</span>
            </div>
          </div>

          <div style={{ marginTop: 36, display: "flex", flexDirection: "column", fontFamily: "Bricolage", fontWeight: 800, fontSize: 68, lineHeight: 1.02, color: INK, letterSpacing: -1 }}>
            <div style={{ display: "flex" }}>“Where should</div>
            <div style={{ display: "flex" }}>we meet?”</div>
            <div style={{ display: "flex", position: "relative", marginTop: 4 }}>
              <div style={{ display: "flex", position: "relative" }}>
                Solved.
                <svg width="210" height="14" viewBox="0 0 200 12" preserveAspectRatio="none" style={{ position: "absolute", left: 0, bottom: -10 }}>
                  <path d="M2 9 C 50 2, 150 2, 198 8" stroke={VOLT} strokeWidth="6" fill="none" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 34, display: "flex", fontFamily: "Figtree", fontWeight: 500, fontSize: 26, lineHeight: 1.35, color: MUTED, maxWidth: 480 }}>
            Fair spots for everyone&apos;s commute. Vote together, then watch friends arrive.
          </div>
        </div>
        <HeroMap />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bricolage", data: bricolage800, weight: 800, style: "normal" },
        { name: "Bricolage", data: bricolage700, weight: 700, style: "normal" },
        { name: "Figtree", data: figtree500, weight: 500, style: "normal" },
        { name: "Figtree", data: figtree700, weight: 700, style: "normal" },
      ],
    },
  );
}
