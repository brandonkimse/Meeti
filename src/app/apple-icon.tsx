import { ImageResponse } from "next/og";

// iPhone home-screen icon: the Meeti mark on lime (iOS needs a PNG, not SVG).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#d4ff3f" }}>
        <svg width="112" height="112" viewBox="0 0 24 24" fill="none" stroke="#17141f" strokeWidth={2.6} strokeLinecap="round">
          <path d="M4 18 C 7 12, 9 12, 12 12 C 15 12, 17 12, 20 18" />
          <circle cx="12" cy="7" r="2.6" fill="#17141f" stroke="none" />
        </svg>
      </div>
    ),
    size,
  );
}
