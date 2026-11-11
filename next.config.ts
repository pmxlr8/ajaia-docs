import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic dynamic rendering: every page reads the session cookie, so the
  // Cache Components / partial prerendering model adds complexity for no gain here.
  cacheComponents: false,
  // PGlite ships a WASM Postgres build; keep it (and pg) out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "happy-dom", "mammoth"],
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
