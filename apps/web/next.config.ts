import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright runs its own dev server beside the one you work in; each needs its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Payment attachments (max 4 MB each, checked in the domain) go through Server Actions.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  transpilePackages: ["@estrada/domain", "@estrada/db", "@estrada/importers"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
