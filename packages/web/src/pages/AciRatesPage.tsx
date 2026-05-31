import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type AciRate, type AciImportBatch } from "../api/client.js";
import { formatDateIt } from "../format.js";

interface ImportRowError {
  row: number;
  messages: string[];
}

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

  useEffect(() => {
    void refreshRates();
  }, []);

  async function onImport(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setRowErrors([]);
    setBatch(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const result = await api.upload<AciImportBatch>("/aci/import", fd);
      setBatch(result);
      await refreshRates(search);
    } catch (err) {
      // The upload helper attaches the full parsed body as `body`; the import
      // endpoint returns { error, righe } on a 400.
      const apiErr = err as { body?: { righe?: ImportRowError[] } };
      setError(t("aci.importError"));
      if (Array.isArray(apiErr.body?.righe)) setRowErrors(apiErr.body!.righe);
    }
  }

  async function onSearch(e: FormEvent): Promise<void> {
    e.preventDefault();
    await refreshRates(search);
  }

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("aci.title")}</h1>
      <p style={{ color: "#555" }}>{t("aci.help")}</p>

      <form onSubmit={onImport} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label={t("aci.file")} required />
        <button type="submit">{t("aci.import")}</button>
      </form>

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
      {batch && (
        <p style={{ color: "#15803d" }}>
          {t("aci.imported")}: {t("aci.batchYear")} {batch.year}, {t("aci.batchRows")} {batch.rowCount},{" "}
          {t("aci.batchAt")} {formatDateIt(batch.importedAt)}
        </p>
      )}
      {rowErrors.length > 0 && (
        <div>
          <h3>{t("aci.errors")}</h3>
          <ul>
            {rowErrors.map((re) => (
              <li key={re.row}>{t("aci.row")} {re.row}: {re.messages.join(" ")}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input
          placeholder={t("aci.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit">{t("aci.search")}</button>
      </form>

      {rates.length === 0 ? (
        <p>{t("aci.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("aci.colYear")}</th>
              <th style={{ textAlign: "left" }}>{t("aci.colMake")}</th>
              <th style={{ textAlign: "left" }}>{t("aci.colModel")}</th>
              <th style={{ textAlign: "left" }}>{t("aci.colFuel")}</th>
              <th style={{ textAlign: "left" }}>{t("aci.colVariant")}</th>
              <th style={{ textAlign: "right" }}>{t("aci.colCost")}</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{r.year}</td>
                <td>{r.make}</td>
                <td>{r.model}</td>
                <td>{r.fuel}</td>
                <td>{r.variant}</td>
                <td style={{ textAlign: "right" }}>{r.costPerKm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
