import { test, expect } from "@playwright/test";

// Precondition: `npm run seed:dev --workspace packages/server` has created
// dipendente@azienda.it (employee) reporting to responsabile@azienda.it
// (manager), both with password "password123". Both servers are started by the
// Playwright webServer config.

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("heading", { name: "Le mie note spese" })).toBeVisible();
}

test("employee creates and submits a report; manager approves it", async ({ page }) => {
  const unique = `Trasferta E2E ${Date.now()}`;

  // Employee: create a report, add an item, submit.
  await login(page, "dipendente@azienda.it");
  await page.getByPlaceholder("Titolo della nota spese").fill(unique);
  await page.getByRole("button", { name: "Crea nota spese" }).click();

  await page.getByRole("row", { name: new RegExp(unique) }).getByRole("link", { name: "Apri" }).click();
  await expect(page.getByRole("heading", { name: unique })).toBeVisible();

  await page.getByPlaceholder("Descrizione").fill("Treno A/R");
  await page.getByPlaceholder("Importo (€)").fill("45,00".replace(",", "."));
  await page.getByLabel("Data").fill("2026-05-20");
  await page.getByRole("button", { name: "Aggiungi voce" }).click();
  await expect(page.getByText("Treno A/R")).toBeVisible();

  await page.getByRole("button", { name: "Invia per approvazione" }).click();
  await expect(page.getByText("Da approvare")).toBeVisible();

  // Manager: log in, open the approval queue, approve.
  await page.getByRole("button", { name: "Esci" }).click();
  await login(page, "responsabile@azienda.it");
  await page.getByRole("link", { name: "Approvazioni" }).click();
  await expect(page.getByRole("heading", { name: "Note spese da approvare" })).toBeVisible();

  await page.getByRole("row", { name: new RegExp(unique) }).getByRole("link", { name: "Apri" }).click();
  await page.getByRole("button", { name: "Approva" }).click();
  await expect(page.getByText("Approvata")).toBeVisible();
});
