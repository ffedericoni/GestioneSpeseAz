import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one Postgres DB; run files sequentially to
    // avoid cross-test interference while resetDb() truncates tables.
    fileParallelism: false,
    // Load packages/server/.env before any test module so TEST_DATABASE_URL
    // and SESSION_SECRET are present (the harness then points Prisma at the
    // test DB).
    setupFiles: ["./src/loadEnv.ts"],
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    hookTimeout: 30000,
  },
});
