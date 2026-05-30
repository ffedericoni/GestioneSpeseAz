import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api, type ReportSummary } from "../api/client.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";

export function ReportsPage(): JSX.Element {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const list = await api.get<ReportSummary[]>("/reports");
    setReports(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/reports", { title });
      setTitle("");
      await refresh();
    } catch {
      setError(t("reports.createError"));
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("reports.title")}</h1>

      <form onSubmit={onCreate} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          placeholder={t("reports.newTitle")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={{ flex: 1 }}
        />
        <button type="submit">{t("reports.create")}</button>
      </form>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : reports.length === 0 ? (
        <p>{t("reports.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("reports.newTitle")}</th>
              <th style={{ textAlign: "left" }}>{t("reports.state")}</th>
              <th style={{ textAlign: "right" }}>{t("reports.total")}</th>
              <th style={{ textAlign: "left" }}>{t("reports.created")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{t(`states.${r.state}`)}</td>
                <td style={{ textAlign: "right" }}>{formatEuroFromCents(r.totalCents)}</td>
                <td>{formatDateIt(r.createdAt)}</td>
                <td>
                  <Link to={`/note-spese/${r.id}`}>{t("reports.open")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
