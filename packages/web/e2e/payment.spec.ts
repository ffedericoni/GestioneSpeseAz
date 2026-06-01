import { test, expect } from "@playwright/test";

// Precondition: `npm run seed:dev --workspace packages/server` has created
// dipendente@ (employee → responsabile@ manager), responsabile@ (manager) and
// amministrazione@ (finance), all password "password123".

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Accedi" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page.getByRole("heading", { name: "Le mie note spese" })).toBeVisible();
}

async function logout(page: import("@playwright/test").Page) {
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/logout") && r.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Esci" }).click(),
  ]);
}

test("finance sends an approved report to payment, marks it paid, and exports CSV", async ({ page }) => {
  const unique = `Pagamento E2E ${Date.now()}`;

  // Employee: create, add an item, submit.
  await login(page, "dipendente@azienda.it");
  await page.getByPlaceholder("Titolo della nota spese").fill(unique);
  await page.getByRole("button", { name: "Crea nota spese" }).click();
  await page.getByRole("row", { name: new RegExp(unique) }).getByRole("link", { name: "Apri" }).click();
  await expect(page.getByRole("heading", { name: unique })).toBeVisible();
  await page.getByPlaceholder("Descrizione").fill("Treno A/R");
  await page.getByPlaceholder("Importo (€)").fill("45.00");
  await page.getByLabel("Data", { exact: true }).fill("2026-05-20");
  await page.getByRole("button", { name: "Aggiungi voce" }).click();
  await expect(page.getByText("Treno A/R")).toBeVisible();
  await page.getByRole("button", { name: "Invia per approvazione" }).click();
  await expect(page.getByText("Da approvare")).toBeVisible();
  await logout(page);

  // Manager: approve.
  await login(page, "responsabile@azienda.it");
  await page.getByRole("link", { name: "Approvazioni" }).click();
  await page.getByRole("row", { name: new RegExp(unique) }).getByRole("link", { name: "Apri" }).click();
  await page.getByRole("button", { name: "Approva" }).click();
  await expect(page.getByText("Approvata")).toBeVisible();
  await logout(page);

  // Finance: send to payment, then mark paid with a reference.
  await login(page, "amministrazione@azienda.it");
  await page.getByRole("link", { name: "Pagamenti" }).click();
  await expect(page.getByRole("heading", { name: "Pagamenti" })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(unique) });
  await row.getByRole("button", { name: "Invia al pagamento" }).click();
  await expect(row.getByText("Inviata al pagamento")).toBeVisible();
  await row.getByRole("button", { name: "Segna come pagata" }).click();
  await row.getByPlaceholder("Riferimento pagamento").fill("BON-E2E");
  await row.getByRole("button", { name: "Conferma pagamento" }).click();
  await expect(row.getByText("Pagata")).toBeVisible();

  // The CSV export link is present and points at the finance-only endpoint.
  const exportLink = page.getByRole("link", { name: "Esporta CSV (note spese)" });
  await expect(exportLink).toHaveAttribute("href", /\/api\/reports\/export\/reports\.csv/);
});
