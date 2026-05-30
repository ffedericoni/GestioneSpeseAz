import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 10000 },
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
