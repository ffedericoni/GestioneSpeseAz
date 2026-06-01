import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string) {
  // Another spec running in parallel may have left an authenticated session in
  // this browser context's cookies; "/" would then render the home page (the
  // app has no "/login" route once authenticated) and the heading check below
  // would time out. Clear any stale session first so we always reach the form.
  await page.request.post("/api/logout");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("heading", { name: "Le mie note spese" })).toBeVisible();
}

const CSV =
  "year,make,model,fuel,variant,costPerKm\n" +
  "2026,Fiat,Panda,Benzina,1.2,0.6543\n";

test("admin imports ACI rates; employee registers a vehicle", async ({ page }) => {
  // Admin imports a rate table.
  await login(page, "admin@azienda.it");
  await page.getByRole("link", { name: "Tabelle ACI" }).click();
  await expect(page.getByRole("heading", { name: "Tabelle ACI" })).toBeVisible();
  await page.getByLabel("File CSV").setInputFiles({
    name: "rates.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page.getByText("Importazione riuscita")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Panda" })).toBeVisible();

  // Employee registers a vehicle linked to an imported rate.
  await page.getByRole("button", { name: "Esci" }).click();
  await login(page, "dipendente@azienda.it");
  await page.getByRole("link", { name: "Veicoli" }).click();
  await expect(page.getByRole("heading", { name: "I miei veicoli" })).toBeVisible();

  await page.getByPlaceholder("Cerca tariffa ACI (marca/modello)").fill("Panda");
  await page.getByRole("button", { name: "Cerca" }).click();
  // The rate dropdown is now populated; the first match is auto-selected.
  await expect(page.getByLabel("Tariffa ACI")).toContainText("Panda");

  const label = `Auto E2E ${Date.now()}`;
  await page.getByPlaceholder("Nome veicolo").fill(label);
  await page.getByPlaceholder("Targa").fill("AB123CD");
  await page.getByRole("button", { name: "Aggiungi veicolo" }).click();

  await expect(page.getByRole("cell", { name: label })).toBeVisible();
});
