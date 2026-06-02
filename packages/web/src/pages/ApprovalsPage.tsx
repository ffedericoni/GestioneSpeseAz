import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check, X, ChevronRight } from "lucide-react";
import { actionsFor } from "@gsa/shared";
import { api, type ReportSummary } from "../api/client.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";
import { StateBadge, Avatar, Filter } from "../components/ui.js";
import { PageHead } from "../components/chrome.js";

interface UserSummary { id: string; fullName: string }

const FILTER_ALL = "Tutte";

export function ApprovalsPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(FILTER_ALL);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [reviseComment, setReviseComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const list = await api.get<ReportSummary[]>("/reports?scope=approvals");
    setReports(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    void api.get<UserSummary[]>("/users").then(setUsers).catch(() => {});
  }, []);

  const filterOptions = [
    FILTER_ALL,
    t("states.READY_FOR_APPROVAL"),
    t("states.IN_REVISION"),
  ];

  const visible = filter === FILTER_ALL
    ? reports
    : reports.filter((r) => t(`states.${r.state}`) === filter);

  function ownerName(ownerId: string): string {
    return users.find((u) => u.id === ownerId)?.fullName ?? "—";
  }

  async function quickAct(
    id: string,
    action: "approve" | "reject"
  ): Promise<void> {
    setError(null);
    try {
      await api.post(`/reports/${id}/${action}`);
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  async function submitRevise(id: string): Promise<void> {
    if (!reviseComment.trim()) return;
    setError(null);
    try {
      await api.post(`/reports/${id}/revise`, { comment: reviseComment });
      setRevisingId(null); setReviseComment("");
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  return (
    <>
      <PageHead
        eyebrow={t("reports.approvalsTitle")}
        title="Note spese"
        accent="da approvare"
        sub={`${visible.length} in attesa`}
        right={
          <Filter
            options={filterOptions}
            active={filter}
            onChange={setFilter}
          />
        }
      />

      {error && (
        <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="pg-meta">{t("common.loading")}</p>
      ) : visible.length === 0 ? (
        <p className="pg-meta">{t("reports.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((r) => {
            const available = actionsFor(r.state);
            const canAct = available.some(
              (a) => a === "approve" || a === "reject" || a === "revise"
            );
            const name = ownerName(r.ownerId);

            return (
              <div
                key={r.id}
                className="pg-card"
                style={{
                  padding: "var(--cardpad)",
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                }}
              >
                {/* Avatar */}
                <Avatar name={name} size={40} />

                {/* Title + meta */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span
                      style={{
                        color: "var(--pg-ink)",
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                      onClick={() => navigate(`/note-spese/${r.id}`)}
                    >
                      {r.title}
                    </span>
                    <StateBadge state={r.state} />
                  </div>
                  <div className="pg-meta" style={{ marginTop: 3 }}>
                    {name}
                    {r.submittedAt && ` · inviata ${formatDateIt(r.submittedAt)}`}
                  </div>
                </div>

                {/* Total */}
                <div style={{ textAlign: "right", marginRight: 6, flexShrink: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--serif)",
                      fontWeight: 500,
                      fontSize: 20,
                      color: "var(--pg-ink)",
                    }}
                  >
                    {formatEuroFromCents(r.totalCents)}
                  </div>
                </div>

                {/* Actions */}
                {canAct && (
                  <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                    <button
                      className="pg-btn pg-btn--ghost"
                      style={{ padding: "7px 12px" }}
                      onClick={() => {
                        setRevisingId(revisingId === r.id ? null : r.id);
                        setReviseComment("");
                      }}
                    >
                      {t("reports.revise")}
                    </button>
                    <button
                      className="pg-btn pg-btn--danger"
                      style={{ padding: "7px 12px" }}
                      onClick={() => void quickAct(r.id, "reject")}
                    >
                      <X size={14} strokeWidth={1.6} />
                      {t("reports.reject")}
                    </button>
                    <button
                      className="pg-btn pg-btn--primary"
                      style={{ padding: "7px 14px" }}
                      onClick={() => void quickAct(r.id, "approve")}
                    >
                      <Check size={14} strokeWidth={1.6} />
                      {t("reports.approve")}
                    </button>
                    <button
                      title={t("reports.open")}
                      className="pg-btn pg-btn--quiet"
                      style={{ padding: "7px 10px" }}
                      onClick={() => navigate(`/note-spese/${r.id}`)}
                    >
                      <ChevronRight size={15} strokeWidth={1.6} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline revise forms — rendered below the card list */}
      {revisingId && (
        <div
          className="pg-card"
          style={{ padding: "var(--cardpad)", marginTop: 16, maxWidth: 520 }}
        >
          <div className="pg-eyebrow" style={{ marginBottom: 10 }}>{t("reports.revise")}</div>
          <label className="pg-field" style={{ marginBottom: 12 }}>
            <span className="pg-label">{t("reports.revisePrompt")}</span>
            <textarea
              className="pg-textarea"
              rows={3}
              value={reviseComment}
              onChange={(e) => setReviseComment(e.target.value)}
              required
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="pg-btn pg-btn--primary"
              disabled={!reviseComment.trim()}
              onClick={() => void submitRevise(revisingId)}
            >
              {t("reports.revise")}
            </button>
            <button
              className="pg-btn pg-btn--ghost"
              onClick={() => { setRevisingId(null); setReviseComment(""); }}
            >
              {t("users.cancel")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
