import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one Postgres DB; run files sequentially to
    // avoid cross-test interference while resetDb() truncates tables.
    fileParallelism: false,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    hookTimeout: 30000,
  },
});
