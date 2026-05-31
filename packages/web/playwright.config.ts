import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 10000 },
  // The specs all exercise one shared dev database and the same seeded users
  // (e.g. several create reports for dipendente@, aci-vehicles imports rates).
  // Running them in parallel races on that shared state and intermittently
  // fails; serialize the suite so the gate is deterministic.
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    locale: "it-IT",
  },
  webServer: [
    {
      command: "npm run dev",
      cwd: "../server",
      url: "http://localhost:3001/health",
      reuseExistingServer: true,
      timeout: 60000,
      // E2E specs log in many times across specs; keep the login rate limiter
      // from throttling the suite (the limiter is exercised by a dedicated
      // server-side test instead).
      env: { LOGIN_RATE_MAX: "1000" },
    },
    {
      command: "npm run dev",
      cwd: ".",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
