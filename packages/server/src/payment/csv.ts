// Pure CSV builder for the accounting export. Framework- and I/O-free.
// Italian Excel conventions: ';' delimiter, decimal comma, CRLF lines, UTF-8 BOM.
import type { ReportState, Category } from "@gsa/shared";

const STATE_LABELS: Record<ReportState, string> = {
  CREATED: "Bozza",
  READY_FOR_APPROVAL: "Da approvare",
  IN_REVISION: "In revisione",
  APPROVED: "Approvata",
  REJECTED: "Respinta",
  SENT_FOR_PAYMENT: "Inviata al pagamento",
  PAID: "Pagata",
};

const CATEGORY_LABELS: Record<Category, string> = {
  MILEAGE: "Rimborso chilometrico",
  MEALS_LODGING: "Vitto e alloggio",
  TRANSPORT: "Trasporti",
  OTHER: "Altro",
};

// Italian decimal, two places, comma separator, NO thousands separator and NO
// currency symbol (keeps the column machine-parseable for the accounting import).
export function formatEuroCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}${euros},${rem.toString().padStart(2, "0")}`;
}

// gg/MM/aaaa using UTC components (item/report dates are stored at midnight UTC,
// so UTC getters yield the intended calendar day regardless of server timezone).
export function formatItDate(date: Date | null): string {
  if (!date) return "";
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

const BOM = "﻿";

// A field needs quoting iff it contains the delimiter, a quote, or a newline.
function escapeField(field: string): string {
  return /[;"\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

export function toCsv(rows: string[][]): string {
  return BOM + rows.map((row) => row.map(escapeField).join(";")).join("\r\n");
}

export interface ReportExportRow {
  ownerName: string;
  title: string;
  state: ReportState;
  totalCents: number;
  submittedAt: Date | null;
  decidedAt: Date | null;
  paidAt: Date | null;
  paymentReference: string | null;
  itemCount: number;
}

const REPORT_HEADERS = [
  "Dipendente",
  "Titolo",
  "Stato",
  "Totale",
  "Data invio",
  "Data decisione",
  "Data pagamento",
  "Riferimento pagamento",
  "N. voci",
];

export function buildReportCsv(rows: ReportExportRow[]): string {
  const body = rows.map((r) => [
    r.ownerName,
    r.title,
    STATE_LABELS[r.state],
    formatEuroCents(r.totalCents),
    formatItDate(r.submittedAt),
    formatItDate(r.decidedAt),
    formatItDate(r.paidAt),
    r.paymentReference ?? "",
    String(r.itemCount),
  ]);
  return toCsv([REPORT_HEADERS, ...body]);
}

export interface ItemExportRow {
  ownerName: string;
  reportTitle: string;
  reportState: ReportState;
  date: Date;
  category: Category;
  description: string;
  amountCents: number;
  vatCents: number | null;
  enteredKm: number | null;
  ratePerKm: string | null;
  vehicleLabel: string | null;
  overageJustification: string | null;
  notes: string | null;
}

const ITEM_HEADERS = [
  "Dipendente",
  "Nota spese",
  "Stato nota",
  "Data",
  "Categoria",
  "Descrizione",
  "Importo",
  "IVA",
  "Km percorsi",
  "Tariffa €/km",
  "Veicolo",
  "Giustificazione",
  "Note",
];

export function buildItemCsv(rows: ItemExportRow[]): string {
  const body = rows.map((r) => [
    r.ownerName,
    r.reportTitle,
    STATE_LABELS[r.reportState],
    formatItDate(r.date),
    CATEGORY_LABELS[r.category],
    r.description,
    formatEuroCents(r.amountCents),
    r.vatCents == null ? "" : formatEuroCents(r.vatCents),
    r.enteredKm == null ? "" : String(r.enteredKm),
    r.ratePerKm ?? "",
    r.vehicleLabel ?? "",
    r.overageJustification ?? "",
    r.notes ?? "",
  ]);
  return toCsv([ITEM_HEADERS, ...body]);
}
