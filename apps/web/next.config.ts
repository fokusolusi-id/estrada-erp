import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright runs its own dev server beside the one you work in; each needs its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@estrada/domain", "@estrada/db"],
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
