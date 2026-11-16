import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite is a Node built-in; keep server code on the Node.js runtime.
  serverExternalPackages: [],
  images: { unoptimized: true },
};

export default nextConfig;
