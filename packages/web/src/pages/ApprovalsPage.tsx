import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { api, type ReportSummary } from "../api/client.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";

export function ApprovalsPage(): JSX.Element {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.get<ReportSummary[]>("/reports?scope=approvals").then((list) => {
      setReports(list);
      setLoading(false);
    });
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("reports.approvalsTitle")}</h1>
      {loading ? (
        <p>{t("common.loading")}</p>
      ) : reports.length === 0 ? (
        <p>{t("reports.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("reports.newTitle")}</th>
              <th style={{ textAlign: "right" }}>{t("reports.total")}</th>
              <th style={{ textAlign: "left" }}>{t("reports.created")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
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
