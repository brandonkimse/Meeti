import type { NextConfig } from "next";

// Basic hardening for every response. Vercel adds HSTS on its own.
const SECURITY_HEADERS = [
  // Nobody else may show Meeti inside a frame (stops clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Location is the only device feature Meeti uses, and only on its own pages.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
];

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
