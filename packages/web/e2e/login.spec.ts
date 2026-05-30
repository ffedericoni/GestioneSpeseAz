import { test, expect } from "@playwright/test";

// Requires a dev admin (admin@azienda.it / password123) in the dev database,
// created via `npm run create:admin`. Both servers are started by the
// Playwright webServer config.
test("admin logs in and sees the Italian user-management page", async ({ page }) => {
  // The API lives under /api, so the SPA route "/login" no longer collides with
  // the dev proxy. We still enter via "/" to exercise the unauthenticated
  // redirect, which is the real user entry point.
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();

  await page.getByLabel("Email").fill("admin@azienda.it");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();

  await expect(page.getByRole("heading", { name: "Gestione utenti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Esci" })).toBeVisible();
});
