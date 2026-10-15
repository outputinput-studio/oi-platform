import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components stay off for stage 1. Per-site storefront caching is a
  // later, deliberate decision; until then every page renders per request.
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
