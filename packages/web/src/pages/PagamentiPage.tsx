import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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

const PAYABLE_STATES: ReportState[] = ["APPROVED", "SENT_FOR_PAYMENT", "PAID"];

export function PagamentiPage(): JSX.Element {
  const { t } = useTranslation();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [filter, setFilter] = useState<ReportState | "">("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setReports(await api.get<ReportSummary[]>("/reports?scope=payments"));
  }

  useEffect(() => {
    void refresh().catch(() => setError(t("payments.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = filter ? reports.filter((r) => r.state === filter) : reports;

  async function onSend(id: string): Promise<void> {
    setError(null);
    try {
      await sendPayment(id);
      await refresh();
    } catch {
      setError(t("payments.actionError"));
    }
  }

  async function onPaid(id: string, input: MarkPaidInput): Promise<void> {
    setError(null);
    try {
      await markPaid(id, input);
      setPayingId(null);
      await refresh();
    } catch {
      setError(t("payments.actionError"));
    }
  }

  return (
    <main style={{ maxWidth: 1000, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("payments.title")}</h1>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label>
          {t("payments.filter")}{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value as ReportState | "")}>
            <option value="">{t("payments.filterAll")}</option>
            {PAYABLE_STATES.map((s) => (
              <option key={s} value={s}>
                {t(`states.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <a href={exportCsvUrl("reports", filter || undefined)} download>
          {t("payments.exportReports")}
        </a>
        <a href={exportCsvUrl("items", filter || undefined)} download>
          {t("payments.exportItems")}
        </a>
      </div>

      {visible.length === 0 ? (
        <p>{t("payments.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("payments.reportTitle")}</th>
              <th style={{ textAlign: "right" }}>{t("payments.total")}</th>
              <th style={{ textAlign: "left" }}>{t("payments.state")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/note-spese/${r.id}`}>{r.title}</Link>
                </td>
                <td style={{ textAlign: "right" }}>{formatEuroFromCents(r.totalCents)}</td>
                <td>{t(`states.${r.state}`)}</td>
                <td>
                  {r.state === "APPROVED" && (
                    <button onClick={() => void onSend(r.id)}>{t("payments.send")}</button>
                  )}
                  {r.state === "SENT_FOR_PAYMENT" &&
                    (payingId === r.id ? (
                      <MarkPaidForm onSubmit={(input) => void onPaid(r.id, input)} />
                    ) : (
                      <button onClick={() => setPayingId(r.id)}>{t("payments.markPaid")}</button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
