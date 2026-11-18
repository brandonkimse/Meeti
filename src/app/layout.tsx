import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-face", weight: ["500", "700", "800"] });
const body = Figtree({ subsets: ["latin"], variable: "--font-body" });

const DESCRIPTION = "Meeti helps friend groups pick a fair place to meet, vote on it together, and see everyone arrive.";

// The preview image comes from app/opengraph-image.tsx. On Vercel, Next.js uses
// the production address as the base URL for it automatically.
export const metadata: Metadata = {
  title: "Meeti · Meet in the middle, fairly",
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "Meeti", title: "Meeti · “Where should we meet?” Solved.", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Meeti · “Where should we meet?” Solved.", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f4ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
