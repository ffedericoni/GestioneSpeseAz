import { test, expect } from "@playwright/test";

// Requires a dev admin (admin@azienda.it / password123) in the dev database,
// created via `npm run create:admin`. Both servers are started by the
// Playwright webServer config.
test("admin logs in and sees the Italian user-management page", async ({ page }) => {
  // Navigate to the SPA entry point rather than doing a hard GET to "/login":
  // the Vite dev server proxies the "/login" path prefix to the Fastify API
  // (which only serves POST /login), so a full-page load of "/login" returns
  // a 404 from the API. Loading "/" boots the React app, and the client-side
  // router redirects an unauthenticated visitor to the login page.
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();

  await page.getByLabel("Email").fill("admin@azienda.it");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();

  await expect(page.getByRole("heading", { name: "Gestione utenti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Esci" })).toBeVisible();
});
