import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string) {
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

test("employee adds a mileage item using an imported rate", async ({ page }) => {
  // Admin imports an ACI rate.
  await login(page, "admin@azienda.it");
  await page.getByRole("link", { name: "Tabelle ACI" }).click();
  await page.getByLabel("File CSV").setInputFiles({
    name: "rates.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV),
  });
  await page.getByRole("button", { name: "Importa" }).click();
  await expect(page.getByText("Importazione riuscita")).toBeVisible();
  await page.getByRole("button", { name: "Esci" }).click();

  // Employee registers a vehicle linked to the rate.
  await login(page, "dipendente@azienda.it");
  await page.getByRole("link", { name: "Veicoli" }).click();
  await page.getByPlaceholder("Cerca tariffa ACI (marca/modello)").fill("Panda");
  await page.getByRole("button", { name: "Cerca" }).click();
  await expect(page.getByLabel("Tariffa ACI")).toContainText("Panda");
  const vehicleLabel = `Auto E2E ${Date.now()}`;
  await page.getByPlaceholder("Nome veicolo").fill(vehicleLabel);
  await page.getByRole("button", { name: "Aggiungi veicolo" }).click();
  await expect(page.getByRole("cell", { name: vehicleLabel })).toBeVisible();

  // Create a report and add a mileage item.
  await page.getByRole("link", { name: "Note spese" }).click();
  const reportTitle = `Trasferta E2E ${Date.now()}`;
  await page.getByPlaceholder("Titolo della nota spese").fill(reportTitle);
  await page.getByRole("button", { name: "Crea nota spese" }).click();
  await page.getByRole("row", { name: reportTitle }).getByRole("link", { name: "Apri" }).click();
  await expect(page.getByRole("heading", { name: reportTitle })).toBeVisible();

  // Switch the category to mileage and fill the sub-form.
  await page.getByLabel("Categoria").selectOption({ label: "Rimborso chilometrico" });
  await page.getByLabel("Data", { exact: true }).fill("2026-05-20");
  await page.getByPlaceholder("Descrizione").fill("Milano-Torino");
  const vehicleOptionValue = await page
    .getByLabel("Veicolo")
    .locator("option", { hasText: vehicleLabel })
    .getAttribute("value");
  await page.getByLabel("Veicolo").selectOption(vehicleOptionValue!);
  await page.getByPlaceholder("Indirizzo di partenza").fill("Milano");
  await page.getByPlaceholder("Indirizzo di arrivo").fill("Torino");
  await page.getByLabel("Distanza stimata (km)").fill("100");
  await page.getByRole("button", { name: "Calcola" }).click();
  await expect(page.getByText(/Intervallo consentito/)).toBeVisible();
  await page.getByLabel("Km percorsi").fill("100");
  await page.getByRole("button", { name: "Aggiungi voce" }).click();

  // 100 km * 0.6543 = 65,43 EUR shows in the row and the total.
  await expect(page.getByRole("cell", { name: "Milano-Torino" })).toBeVisible();
  await expect(page.getByText("65,43", { exact: false }).first()).toBeVisible();
});
