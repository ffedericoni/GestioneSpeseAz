import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { actionsFor, MONEY_CATEGORIES, type MoneyCategory } from "@gsa/shared";
import { api, type ReportDetail } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";

export function ReportDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New-item form state
  const [category, setCategory] = useState<MoneyCategory>("TRANSPORT");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    if (!id) return;
    setReport(await api.get<ReportDetail>(`/reports/${id}`));
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!report) return <p style={{ fontFamily: "system-ui", margin: "2rem" }}>{t("common.loading")}</p>;

  const isOwner = report.ownerId === user?.id;
  const editable =
    report.state === "CREATED" ||
    report.state === "READY_FOR_APPROVAL" ||
    report.state === "IN_REVISION";
  const available = actionsFor(report.state);
  const canManage = available.some((a) => a === "approve" || a === "reject" || a === "revise");

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/reports/${report!.id}/items`, {
        category,
        date,
        description,
        amountCents: Math.round(Number(amount) * 100),
      });
      setDescription("");
      setAmount("");
      setDate("");
      await refresh();
    } catch {
      setError(t("items.addError"));
    }
  }

  async function removeItem(itemId: string): Promise<void> {
    await api.del(`/reports/${report!.id}/items/${itemId}`);
    await refresh();
  }

  async function act(action: "submit" | "approve" | "reject" | "revise"): Promise<void> {
    setError(null);
    try {
      if (action === "revise") {
        const comment = window.prompt(t("reports.revisePrompt")) ?? "";
        if (!comment) return;
        await api.post(`/reports/${report!.id}/revise`, { comment });
      } else {
        await api.post(`/reports/${report!.id}/${action}`);
      }
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <p><Link to="/note-spese">{t("reports.back")}</Link></p>
      <h1>{report.title}</h1>
      <p>
        {t("reports.state")}: <strong>{t(`states.${report.state}`)}</strong> ·{" "}
        {t("reports.total")}: <strong>{formatEuroFromCents(report.totalCents)}</strong>
      </p>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      <h2>{t("items.heading")}</h2>
      {report.items.length === 0 ? (
        <p>{t("items.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("items.date")}</th>
              <th style={{ textAlign: "left" }}>{t("items.category")}</th>
              <th style={{ textAlign: "left" }}>{t("items.description")}</th>
              <th style={{ textAlign: "right" }}>{t("items.amount")}</th>
              {isOwner && editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {report.items.map((it) => (
              <tr key={it.id}>
                <td>{formatDateIt(it.date)}</td>
                <td>{t(`categories.${it.category}`)}</td>
                <td>{it.description}</td>
                <td style={{ textAlign: "right" }}>{formatEuroFromCents(it.amountCents)}</td>
                {isOwner && editable && (
                  <td>
                    <button onClick={() => void removeItem(it.id)}>{t("items.remove")}</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isOwner && editable && (
        <form onSubmit={addItem} style={{ display: "grid", gap: 8, maxWidth: 480, marginTop: 16 }}>
          <h3>{t("items.add")}</h3>
          <select value={category} onChange={(e) => setCategory(e.target.value as MoneyCategory)}>
            {MONEY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`categories.${c}`)}</option>
            ))}
          </select>
          <input
            type="date"
            aria-label={t("items.date")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <input
            placeholder={t("items.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={t("items.amount")}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <button type="submit">{t("items.add")}</button>
        </form>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        {isOwner && available.includes("submit") && (
          <button onClick={() => void act("submit")}>{t("reports.submit")}</button>
        )}
        {canManage && (
          <>
            <button onClick={() => void act("approve")}>{t("reports.approve")}</button>
            <button onClick={() => void act("reject")}>{t("reports.reject")}</button>
            <button onClick={() => void act("revise")}>{t("reports.revise")}</button>
          </>
        )}
      </div>
    </main>
  );
}
