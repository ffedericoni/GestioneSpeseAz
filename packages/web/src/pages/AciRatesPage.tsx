import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";
import { api, type AciRate, type AciImportBatch, type ApiError } from "../api/client.js";
import { formatDateIt } from "../format.js";
import { PageHead } from "../components/chrome.js";

interface ImportRowError { row: number; messages: string[] }

// Fuel pill colors
const FUEL_COLOR: Record<string, string> = {
  Benzina:   "#2c5d86",
  Gasolio:   "#4d5a3a",
  Ibrido:    "#2f7d52",
  Elettrico: "#1a6b6b",
  GPL:       "#8a5c2e",
  Metano:    "#5a3d7a",
};

export function AciRatesPage(): JSX.Element {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [batch, setBatch] = useState<AciImportBatch | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rates, setRates] = useState<AciRate[]>([]);

  async function refreshRates(term = ""): Promise<void> {
    setRates(await api.get<AciRate[]>(`/aci/rates?search=${encodeURIComponent(term)}`));
  }

  useEffect(() => { void refreshRates(); }, []);

  async function onImport(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setRowErrors([]); setBatch(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const result = await api.upload<AciImportBatch>("/aci/import", fd);
      setBatch(result); await refreshRates(search);
    } catch (err) {
      const righe = (err as ApiError).body?.righe;
      setError(t("aci.importError"));
      if (Array.isArray(righe)) setRowErrors(righe as ImportRowError[]);
    }
  }

  async function onSearch(e: FormEvent): Promise<void> {
    e.preventDefault(); await refreshRates(search);
  }

  return (
    <>
      <PageHead
        eyebrow={t("aci.title")}
        title="Tabelle"
        accent="ACI"
      />

      {/* Import card */}
      <div className="pg-card" style={{ padding: "var(--cardpad)", marginBottom: 20 }}>
        <div className="pg-eyebrow" style={{ marginBottom: 14 }}>{t("aci.import")}</div>
        <form onSubmit={onImport} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="pg-field">
            <span className="pg-label">{t("aci.file")}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              required
              style={{
                fontSize: 13,
                color: "var(--pg-body)",
                padding: "7px 0",
              }}
            />
          </label>
          <button type="submit" className="pg-btn pg-btn--primary">
            {t("aci.import")}
          </button>
        </form>
        <p className="pg-mono" style={{ marginTop: 10, color: "var(--pg-muted)" }}>
          {t("aci.help")}
        </p>

        {error && (
          <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginTop: 8 }}>
            {error}
          </p>
        )}

        {rowErrors.length > 0 && (
          <ul style={{ fontSize: 12.5, color: "var(--pg-danger)", marginTop: 8 }}>
            {rowErrors.map((re) => (
              <li key={re.row}>
                {t("aci.row")} {re.row}: {re.messages.join(" ")}
              </li>
            ))}
          </ul>
        )}

        {batch && (
          <div
            style={{
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "var(--pg-green-bg)",
              color: "var(--pg-green)",
              borderRadius: 999,
              padding: "5px 14px",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <Check size={13} strokeWidth={2} />
            {t("aci.imported")}: {t("aci.batchYear")} {batch.year}
            {" · "}{t("aci.batchRows")} {batch.rowCount}
            {" · "}{t("aci.batchAt")} {formatDateIt(batch.importedAt)}
          </div>
        )}
      </div>

      {/* Search */}
      <form onSubmit={onSearch} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <label className="pg-field" style={{ flex: 1, maxWidth: 400 }}>
          <span className="pg-label">{t("aci.search")}</span>
          <input
            className="pg-input"
            placeholder={t("aci.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button type="submit" className="pg-btn pg-btn--ghost" style={{ alignSelf: "flex-end" }}>
          <Search size={14} strokeWidth={1.6} />
          {t("aci.search")}
        </button>
      </form>

      {/* Rates table */}
      {rates.length === 0 ? (
        <p className="pg-meta">{t("aci.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden" }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("aci.colYear")}</th>
                <th>{t("aci.colMake")}</th>
                <th>{t("aci.colModel")}</th>
                <th>{t("aci.colFuel")}</th>
                <th>{t("aci.colVariant")}</th>
                <th className="pg-num">{t("aci.colCost")}</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => {
                const fuelColor = FUEL_COLOR[r.fuel] ?? "var(--pg-slate)";
                return (
                  <tr key={r.id}>
                    <td>{r.year}</td>
                    <td style={{ fontWeight: 600, color: "var(--pg-ink)" }}>{r.make}</td>
                    <td>{r.model}</td>
                    <td>
                      <span
                        className="pg-badge"
                        style={{
                          color: fuelColor,
                          background: fuelColor + "22",
                          fontSize: 11,
                        }}
                      >
                        <span className="dot" />
                        {r.fuel}
                      </span>
                    </td>
                    <td className="pg-meta">{r.variant}</td>
                    <td className="pg-num">{r.costPerKm}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
