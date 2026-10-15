import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pictures arrive through a server action after the phone has shrunk them.
  // Next's default is 1 MB; the module's own cap is 4 MB (Vercel allows 4.5).
  experimental: { serverActions: { bodySizeLimit: "4500kb" } },
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
