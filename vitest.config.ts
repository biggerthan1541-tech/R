import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // The integration files share one database. Locally that database is PGlite,
    // which serves a single connection, so parallel files corrupt each other's
    // extended-query state. Serial costs ~nothing at this size.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
