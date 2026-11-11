import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // Each test file gets a fresh in-memory Postgres (PGlite); no setup needed.
    env: { PGLITE_DIR: "memory://", SKIP_SEED_DOCS: "1" },
    testTimeout: 20000,
  },
});
