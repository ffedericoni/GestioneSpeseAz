import { describe, it, expect } from "vitest";
import {
  toCsv,
  formatEuroCents,
  formatItDate,
  buildReportCsv,
  buildItemCsv,
} from "./csv.js";

describe("toCsv", () => {
  it("joins fields with ; and rows with CRLF and prefixes a UTF-8 BOM", () => {
    const out = toCsv([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(out).toBe("﻿a;b\r\nc;d");
  });

  it("quotes fields containing the delimiter, quotes or newlines and doubles inner quotes", () => {
    const out = toCsv([["plain", "has;semi", 'has"quote', "has\nnewline"]]);
    expect(out).toBe('﻿plain;"has;semi";"has""quote";"has\nnewline"');
  });
});

describe("formatEuroCents", () => {
  it("formats integer cents as Italian decimals without thousands separators", () => {
    expect(formatEuroCents(6543)).toBe("65,43");
    expect(formatEuroCents(100000)).toBe("1000,00");
    expect(formatEuroCents(5)).toBe("0,05");
    expect(formatEuroCents(0)).toBe("0,00");
  });
});

describe("formatItDate", () => {
  it("formats a date as gg/MM/aaaa (UTC) and null as empty", () => {
    expect(formatItDate(new Date("2026-05-20T00:00:00.000Z"))).toBe("20/05/2026");
    expect(formatItDate(null)).toBe("");
  });
});

describe("buildReportCsv", () => {
  it("emits the Italian header row then one row per report", () => {
    const csv = buildReportCsv([
      {
        ownerName: "Elsa Dipendente",
        title: "Trasferta",
        state: "PAID",
        totalCents: 6543,
        submittedAt: new Date("2026-05-01T00:00:00.000Z"),
        decidedAt: new Date("2026-05-02T00:00:00.000Z"),
        paidAt: new Date("2026-05-03T00:00:00.000Z"),
        paymentReference: "BON-123",
        itemCount: 2,
      },
    ]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe(
      "Dipendente;Titolo;Stato;Totale;Data invio;Data decisione;Data pagamento;Riferimento pagamento;N. voci",
    );
    expect(lines[1]).toBe(
      "Elsa Dipendente;Trasferta;Pagata;65,43;01/05/2026;02/05/2026;03/05/2026;BON-123;2",
    );
  });

  it("emits only the header for an empty set", () => {
    const csv = buildReportCsv([]);
    expect(csv.replace("﻿", "")).toBe(
      "Dipendente;Titolo;Stato;Totale;Data invio;Data decisione;Data pagamento;Riferimento pagamento;N. voci",
    );
  });
});

describe("buildItemCsv", () => {
  it("emits Italian headers and leaves mileage columns empty for money items", () => {
    const csv = buildItemCsv([
      {
        ownerName: "Elsa Dipendente",
        reportTitle: "Trasferta",
        reportState: "APPROVED",
        date: new Date("2026-05-20T00:00:00.000Z"),
        category: "TRANSPORT",
        description: "Treno",
        amountCents: 4500,
        vatCents: null,
        enteredKm: null,
        ratePerKm: null,
        vehicleLabel: null,
        overageJustification: null,
        notes: null,
      },
    ]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe(
      "Dipendente;Nota spese;Stato nota;Data;Categoria;Descrizione;Importo;IVA;Km percorsi;Tariffa €/km;Veicolo;Giustificazione;Note",
    );
    expect(lines[1]).toBe(
      "Elsa Dipendente;Trasferta;Approvata;20/05/2026;Trasporti;Treno;45,00;;;;;;",
    );
  });

  it("fills mileage columns for a mileage item", () => {
    const csv = buildItemCsv([
      {
        ownerName: "Elsa",
        reportTitle: "Giro",
        reportState: "PAID",
        date: new Date("2026-05-20T00:00:00.000Z"),
        category: "MILEAGE",
        description: "Milano-Torino",
        amountCents: 6543,
        vatCents: null,
        enteredKm: 100,
        ratePerKm: "0.6543",
        vehicleLabel: "Auto",
        overageJustification: null,
        notes: null,
      },
    ]);
    const row = csv.replace("﻿", "").split("\r\n")[1];
    expect(row).toBe("Elsa;Giro;Pagata;20/05/2026;Rimborso chilometrico;Milano-Torino;65,43;;100;0.6543;Auto;;");
  });
});
