import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronRight } from "lucide-react";
import { api, type ReportSummary } from "../api/client.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";
import { StateBadge } from "../components/ui.js";
import { PageHead } from "../components/chrome.js";

export function ReportsPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
    <>
      <PageHead
        eyebrow={t("reports.title")}
        title="Note"
        accent="spese"
      />

      {/* Create card */}
      <div className="pg-card" style={{ padding: "var(--cardpad)", marginBottom: 24 }}>
        <div
          className="pg-eyebrow"
          style={{ marginBottom: 12 }}
        >
          {t("reports.create")}
        </div>
        <form onSubmit={onCreate} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <label className="pg-field" style={{ flex: 1 }}>
            <span className="pg-label">{t("reports.newTitle")}</span>
            <input
              className="pg-input"
              placeholder={t("reports.newTitle")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="pg-btn pg-btn--gold">
            <Plus size={15} strokeWidth={2} />
            {t("reports.create")}
          </button>
        </form>
        {error && (
          <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="pg-meta">{t("common.loading")}</p>
      ) : reports.length === 0 ? (
        <p className="pg-meta">{t("reports.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden" }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("reports.newTitle")}</th>
                <th>{t("reports.state")}</th>
                <th className="pg-num">{t("reports.total")}</th>
                <th>{t("reports.created")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/note-spese/${r.id}`)}
                >
                  <td style={{ fontWeight: 600, color: "var(--pg-ink)" }}>{r.title}</td>
                  <td><StateBadge state={r.state} /></td>
                  <td className="pg-num">{formatEuroFromCents(r.totalCents)}</td>
                  <td>{formatDateIt(r.createdAt)}</td>
                  <td style={{ width: 32 }}>
                    <ChevronRight size={15} color="var(--pg-muted)" strokeWidth={1.6} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
