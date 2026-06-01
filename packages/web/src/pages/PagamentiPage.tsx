import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Download, Check } from "lucide-react";
import {
  api,
  sendPayment,
  markPaid,
  exportCsvUrl,
  type ReportSummary,
  type ReportState,
  type MarkPaidInput,
} from "../api/client.js";
import { formatEuroFromCents } from "../format.js";
import { MarkPaidForm } from "../components/MarkPaidForm.js";
import { StateBadge, Filter } from "../components/ui.js";
import { PageHead } from "../components/chrome.js";

const PAYABLE_STATES: ReportState[] = ["APPROVED", "SENT_FOR_PAYMENT", "PAID"];
const FILTER_ALL = "Tutti";

export function PagamentiPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [filter, setFilter] = useState(FILTER_ALL);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setReports(await api.get<ReportSummary[]>("/reports?scope=payments"));
  }

  useEffect(() => {
    void refresh().catch(() => setError(t("payments.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterOptions = [
    FILTER_ALL,
    ...PAYABLE_STATES.map((s) => t(`states.${s}`)),
  ];

  const visible =
    filter === FILTER_ALL
      ? reports
      : reports.filter((r) => t(`states.${r.state}`) === filter);

  async function onSend(id: string): Promise<void> {
    setError(null);
    try { await sendPayment(id); await refresh(); }
    catch { setError(t("payments.actionError")); }
  }

  async function onPaid(id: string, input: MarkPaidInput): Promise<void> {
    setError(null);
    try { await markPaid(id, input); setPayingId(null); await refresh(); }
    catch { setError(t("payments.actionError")); }
  }

  return (
    <>
      <PageHead
        eyebrow={t("payments.title")}
        title="Gestione"
        accent="pagamenti"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={exportCsvUrl("reports")}
              download
              className="pg-btn pg-btn--ghost"
              style={{ textDecoration: "none", fontSize: 12 }}
            >
              <Download size={14} strokeWidth={1.6} />
              {t("payments.exportReports")}
            </a>
            <a
              href={exportCsvUrl("items")}
              download
              className="pg-btn pg-btn--ghost"
              style={{ textDecoration: "none", fontSize: 12 }}
            >
              <Download size={14} strokeWidth={1.6} />
              {t("payments.exportItems")}
            </a>
          </div>
        }
      />

      <div style={{ marginBottom: 18 }}>
        <Filter options={filterOptions} active={filter} onChange={setFilter} />
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="pg-meta">{t("payments.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden" }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("payments.reportTitle")}</th>
                <th>{t("payments.state")}</th>
                <th className="pg-num">{t("payments.total")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "var(--pg-ink)",
                        cursor: "pointer",
                      }}
                      onClick={() => navigate(`/note-spese/${r.id}`)}
                    >
                      {r.title}
                    </span>
                  </td>
                  <td><StateBadge state={r.state} /></td>
                  <td className="pg-num">{formatEuroFromCents(r.totalCents)}</td>
                  <td>
                    {r.state === "APPROVED" && (
                      <button
                        className="pg-btn pg-btn--primary"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        onClick={() => void onSend(r.id)}
                      >
                        {t("payments.send")}
                      </button>
                    )}
                    {r.state === "SENT_FOR_PAYMENT" &&
                      (payingId === r.id ? (
                        <MarkPaidForm onSubmit={(input) => void onPaid(r.id, input)} />
                      ) : (
                        <button
                          className="pg-btn pg-btn--gold"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={() => setPayingId(r.id)}
                        >
                          {t("payments.markPaid")}
                        </button>
                      ))}
                    {r.state === "PAID" && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          color: "var(--pg-green)",
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}
                      >
                        <Check size={13} strokeWidth={2} />
                        {r.decidedAt ? new Date(r.decidedAt).toLocaleDateString("it-IT") : t("states.PAID")}
                      </span>
                    )}
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
