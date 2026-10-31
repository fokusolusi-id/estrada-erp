import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
