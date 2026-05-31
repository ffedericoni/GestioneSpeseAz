# Slice 4 — Payment & CSV Export — Design

**Date:** 2026-05-31
**Status:** Approved
**Depends on:** Slices 1, 2, 3a, 3b (state machine, reports/items, ACI/vehicles, mileage).

## 1. Goal & Scope

Expose the final two stages of the expense-report lifecycle to Finance and give
Finance an accounting export.

**In scope:**

- Expose the two Finance transitions already defined in `@gsa/shared`:
  - `send-payment`: `APPROVED → SENT_FOR_PAYMENT` (actor `FINANCE`).
  - `mark-paid`: `SENT_FOR_PAYMENT → PAID` (actor `FINANCE`).
- `mark-paid` records **`paidAt`** (defaults to today, editable by Finance) and an
  **optional `paymentReference`** (free text — e.g. a bank/transfer id). Both
  columns already exist on `ExpenseReport`; **no migration is required**.
- A Finance **payments queue** page (`/pagamenti`) plus a nav entry visible to
  `FINANCE` and `ADMIN`.
- **Two CSV exports** for the accounting system:
  - **report-level** — one row per report (totals);
  - **item-level** — one row per expense line item.

**Out of scope (deferred, documented in README):**

- Override / reverse transitions (un-pay a report, bounce an `APPROVED` report
  back to the manager). The master design mentions Finance override; it is *not*
  built in this slice — only the forward transitions.
- Payment "runs"/batches, bank integration, emailing the export.
- Editing a `MILEAGE` item (still deferred from Slice 3b).

## 2. State machine / shared (`@gsa/shared`)

No changes. `TRANSITIONS`, `findTransition`, and `actionsFor` already include both
Finance actions, and `actorSatisfies("FINANCE")` already grants both `FINANCE`
and `ADMIN` (via `hasAtLeast(role, "FINANCE")`).

The CSV builder is **server-only** (`packages/server/src/payment/csv.ts`); the web
app never builds CSVs, so this logic does not belong in `@gsa/shared`.

## 3. Server — transitions

- Extend `performTransition(reportId, action, actor, comment?, payment?)` with an
  optional `payment?: { paidAt: Date; paymentReference: string | null }`. The
  payment fields are written **only** on the `mark-paid` action (set
  `paidAt` and `paymentReference` in the same guarded `update`).
- `POST /api/reports/:id/send-payment` — parameterless; reuses the existing
  `runTransition` driver in `reports.routes.ts`.
- `POST /api/reports/:id/mark-paid` — body validated by `markPaidSchema`:
  - `paidAt?: string` — ISO date (`YYYY-MM-DD`) or full ISO datetime; if omitted,
    defaults to `new Date()`. Invalid date → 400 `DATI_NON_VALIDI`.
  - `paymentReference?: string` — trimmed; stored as `null` when empty/absent.
- Authorization and illegal-state handling reuse the existing `TransitionError`
  → HTTP mapping: `NON_AUTORIZZATO` → 403, `TRANSIZIONE_NON_VALIDA` → 409. So an
  Employee or Manager calling these endpoints gets **403**; calling against a
  report in the wrong state gets **409**; a missing report gets **404**.

## 4. Server — CSV export

### 4.1 Pure core (`packages/server/src/payment/csv.ts`, TDD)

Framework- and I/O-free. Unit-tested from `packages/server/src/payment/csv.test.ts`.

- `toCsv(rows: string[][]): string`
  - Field escaping: a field is quoted (`"..."`) iff it contains `;`, `"`,
    `\n`, or `\r`; internal `"` are doubled (`""`).
  - **Delimiter `;`** (Italian Excel default; avoids clashing with the decimal
    comma).
  - Lines joined with **CRLF** (`\r\n`).
  - Output is **prefixed with a UTF-8 BOM** (`﻿`) so Excel detects UTF-8 and
    renders accented characters correctly.
- `formatEuroCents(cents: number): string` — Italian decimal, two places, comma
  separator, **no** thousands separator and **no** `€` symbol (keeps the column
  machine-parseable). E.g. `6543 → "65,43"`, `100000 → "1000,00"`.
- `formatItDate(date: Date | null): string` — `gg/MM/aaaa`; `null → ""`.
- `buildReportCsv(reports): string` and `buildItemCsv(items): string` — map domain
  rows to `string[][]` (header row first), then `toCsv`.

### 4.2 Endpoints (`packages/server/src/payment/payment.routes.ts`)

Mounted under `/api` (registered in `app.ts` with prefix `/reports`). FINANCE+ only.

- `GET /api/reports/export/reports.csv?state=<STATE>`
- `GET /api/reports/export/items.csv?state=<STATE>`

Behaviour:

- Auth: unauthenticated → 401 `NON_AUTENTICATO`; authenticated but below FINANCE
  → 403 `NON_AUTORIZZATO`.
- `state` query param optional. If present it must be a member of `REPORT_STATES`;
  otherwise → 400 `DATI_NON_VALIDI`. If absent, defaults to the payable set
  **`{APPROVED, SENT_FOR_PAYMENT, PAID}`** (`EXPORTABLE_STATES`).
- Response headers:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="note-spese-YYYY-MM-DD.csv"`
    (item export uses `voci-spese-YYYY-MM-DD.csv`).
- Reports/items are loaded across all owners (Finance is company-wide), ordered
  deterministically (reports by `submittedAt asc, id asc`; items by report then
  `date asc, id asc`).

### 4.3 Column definitions (Italian headers)

**Report CSV:** `Dipendente`, `Titolo`, `Stato`, `Totale`, `Data invio`,
`Data decisione`, `Data pagamento`, `Riferimento pagamento`, `N. voci`.

- `Stato` uses the Italian state label (same vocabulary as the UI: `APPROVED →
  "Approvata"`, `SENT_FOR_PAYMENT → "Inviata al pagamento"`, `PAID → "Pagata"`,
  etc.). A small server-side label map mirrors the UI labels.
- `Totale` via `formatEuroCents(totalCents)`.

**Item CSV:** `Dipendente`, `Nota spese`, `Stato nota`, `Data`, `Categoria`,
`Descrizione`, `Importo`, `IVA`, `Km percorsi`, `Tariffa €/km`, `Veicolo`,
`Giustificazione`, `Note`.

- `Categoria` uses an Italian category label map (`MILEAGE → "Rimborso
  chilometrico"`, `MEALS_LODGING → "Vitto e alloggio"`, `TRANSPORT →
  "Trasporti"`, `OTHER → "Altro"`).
- `Importo` via `formatEuroCents(amountCents)`; `IVA` via `formatEuroCents` or
  empty when `vatCents` is null.
- Mileage-only columns (`Km percorsi`, `Tariffa €/km`, `Veicolo`,
  `Giustificazione`) are empty for money items.

## 5. Web

- **`api/client.ts`:**
  - `sendPayment(id: string)` → `POST /reports/:id/send-payment`.
  - `markPaid(id: string, input: { paidAt?: string; paymentReference?: string })`
    → `POST /reports/:id/mark-paid`.
  - `exportCsvUrl(level: "reports" | "items", state?: ReportState): string` —
    builds the `/api/reports/export/<level>.csv` URL with an optional `state`
    query param. Download is triggered by a plain `<a href download>` element so
    the session cookie is sent automatically (no fetch/blob plumbing).
- **`PagamentiPage`** (route `/pagamenti`):
  - Lists reports in `APPROVED` and `SENT_FOR_PAYMENT` (and recently `PAID`), by
    fetching with a finance scope (see §6). Each row shows owner, title, total,
    state.
  - `APPROVED` rows: **"Invia al pagamento"** button → `sendPayment`.
  - `SENT_FOR_PAYMENT` rows: **"Segna come pagata"** opens a small inline form —
    a date input prefilled with today and an optional reference text field — then
    `markPaid`.
  - A `state` filter `<select>` and two **"Esporta CSV"** download links
    (`<a>` to `exportCsvUrl(...)`).
- **`ReportDetailPage`:** widen the `act()` action union to include
  `send-payment` and `mark-paid`, and render those buttons (driven by the existing
  `actionsFor(report.state)` pattern) when the viewer is Finance. `mark-paid`
  reuses the same small payment form, extracted as a tiny shared component
  (`MarkPaidForm`) to stay DRY between the queue and the detail page.
- **Nav:** add a **"Pagamenti"** link for `hasAtLeast(user.role, "FINANCE")`.
- **i18n:** add `nav.payments`, a `payments.*` block (queue labels, the mark-paid
  form, export buttons, the date/reference fields), and `reports.sendPayment` /
  `reports.markPaid`. State labels for `SENT_FOR_PAYMENT`/`PAID` already exist.

## 6. Listing reports for Finance

The report list endpoint (`GET /api/reports`) currently supports
`?scope=approvals` (manager queue). Add `?scope=payments` returning reports in
`{APPROVED, SENT_FOR_PAYMENT, PAID}` across all owners, restricted to FINANCE+
(below FINANCE → 403). Ordered by `submittedAt asc`. The web `PagamentiPage`
fetches with this scope and filters client-side by the chosen state.

## 7. Seed & E2E

- `seedDev`: add a FINANCE user **`amministrazione@azienda.it`** (password
  `password123`). `ADMIN` already satisfies FINANCE, but a real FINANCE user
  exercises the role boundary and matches the documented login set.
- **E2E (`packages/web/e2e/payment.spec.ts`):** employee creates a report with an
  item → manager approves → finance opens **Pagamenti**, sends it to payment,
  marks it paid with a reference → triggers / verifies a CSV export. Reuses the
  existing Playwright config (login rate limit already raised).

## 8. Testing strategy (TDD)

- **Pure CSV core (`csv.test.ts`):** escaping (`;`, `"`, newline), delimiter, BOM
  presence, CRLF, `formatEuroCents` (incl. rounding edge and zero), `formatItDate`
  (incl. null), header order, empty data set produces header only.
- **API integration (`payment.api.test.ts`):**
  - `send-payment`: 401 unauth; 403 employee; 403 manager (not finance); 200
    finance from `APPROVED`; 409 from a non-`APPROVED` state; 404 missing.
  - `mark-paid`: 200 finance records `paidAt` + `paymentReference`; defaults
    `paidAt` to ~now when omitted; stores null reference when empty; 400 invalid
    date; 409 wrong state; 403 non-finance.
  - export: 401 unauth; 403 non-finance; 200 with correct `Content-Type` and
    `Content-Disposition`; body begins with BOM and the Italian header row;
    `?state=PAID` filters; invalid `?state=` → 400; report-level vs item-level
    shapes.
  - `?scope=payments` on the list endpoint: 403 non-finance; finance gets the
    three payable states across owners.
- **Web:** no unit tests (project convention); covered by `tsc -b && vite build`
  and the Playwright E2E.

## 9. Files

**Shared:** none.

**Server:**
- Create: `src/payment/csv.ts`, `src/payment/csv.test.ts`,
  `src/payment/payment.routes.ts`, `test/payment.api.test.ts`.
- Modify: `src/reports/reports.service.ts` (payment param on
  `performTransition`), `src/reports/reports.routes.ts` (two transition endpoints
  + `?scope=payments`), `src/reports/reports.schemas.ts` (`markPaidSchema`),
  `src/app.ts` (register `paymentRoutes`), `src/scripts/seedDev.ts` (FINANCE
  user).

**Web:**
- Create: `src/pages/PagamentiPage.tsx`, `src/components/MarkPaidForm.tsx`,
  `e2e/payment.spec.ts`.
- Modify: `src/api/client.ts`, `src/i18n.ts`, `src/components/NavBar.tsx`,
  `src/App.tsx` (route), `src/pages/ReportDetailPage.tsx`.

**Docs:** update `README.md` (Slice 4 section; move payment/export out of "not
implemented").

## 10. Money & formatting invariants (unchanged)

Money stays integer cents end to end; the CSV's `Importo`/`Totale`/`IVA` columns
are formatted to Italian decimal strings only at the export boundary. The ACI rate
remains a `Decimal` string. No floating-point money math is introduced.
