import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, X, Send, AlertTriangle } from "lucide-react";
import {
  actionsFor,
  hasAtLeast,
  MONEY_CATEGORIES,
  type MoneyCategory,
  type Category,
} from "@gsa/shared";
import {
  api,
  quoteMileage,
  markPaid,
  type ReportDetail,
  type Vehicle,
  type MileageQuote,
  type MarkPaidInput,
} from "../api/client.js";
import { MarkPaidForm } from "../components/MarkPaidForm.js";
import { useAuth } from "../auth/AuthContext.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";
import { StateBadge, CatTag } from "../components/ui.js";
import { PageHead, useSetDetailTitle } from "../components/chrome.js";

export function ReportDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Item form state
  const [category, setCategory] = useState<Category>("TRANSPORT");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  // Mileage sub-form state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [estimatedKm, setEstimatedKm] = useState("");
  const [enteredKm, setEnteredKm] = useState("");
  const [justification, setJustification] = useState("");
  const [quote, setQuote] = useState<MileageQuote | null>(null);

  // Action form state
  const [showPayForm, setShowPayForm] = useState(false);
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [reviseComment, setReviseComment] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    if (!id) return;
    setReport(await api.get<ReportDetail>(`/reports/${id}`));
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void api
      .get<Vehicle[]>("/vehicles")
      .then((vs) => setVehicles(vs.filter((v) => v.active)))
      .catch(() => setVehicles([]));
  }, []);

  // Push report title into shell breadcrumb
  useSetDetailTitle(report?.title ?? "");

  if (!report) {
    return <p className="pg-meta" style={{ padding: "2rem" }}>{t("common.loading")}</p>;
  }

  const isOwner = report.ownerId === user?.id;
  const editable =
    report.state === "CREATED" ||
    report.state === "READY_FOR_APPROVAL" ||
    report.state === "IN_REVISION";
  const available = actionsFor(report.state);
  const canManage =
    !!user &&
    hasAtLeast(user.role, "MANAGER") &&
    available.some((a) => a === "approve" || a === "reject" || a === "revise");
  const isFinance = !!user && hasAtLeast(user.role, "FINANCE");
  const overBound = quote != null && Number(enteredKm) > quote.upperBoundKm;

  // Per-category totals for the totals strip
  const CAT_ORDER: Category[] = ["TRANSPORT", "MILEAGE", "MEALS_LODGING", "OTHER"];
  const byCat = CAT_ORDER.map((cat) => ({
    cat,
    cents: report.items
      .filter((i) => i.category === cat)
      .reduce((s, i) => s + i.amountCents, 0),
  })).filter((g) => g.cents > 0);

  // Revision note from the latest IN_REVISION event
  const revisionEvent = report.events
    .slice()
    .reverse()
    .find((e) => e.toState === "IN_REVISION");

  function resetItemForm(): void {
    setDescription(""); setAmount(""); setDate(""); setVehicleId("");
    setOrigin(""); setDestination(""); setRoundTrip(false);
    setEstimatedKm(""); setEnteredKm(""); setJustification(""); setQuote(null);
  }

  async function onCalculate(): Promise<void> {
    setError(null);
    try {
      const q = await quoteMileage({
        vehicleId, originAddress: origin, destinationAddress: destination,
        roundTrip, manualKm: Math.round(Number(estimatedKm)),
      });
      setQuote(q);
    } catch {
      setError(t("items.mileage.quoteError"));
    }
  }

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    try {
      if (category === "MILEAGE") {
        await api.post(`/reports/${report!.id}/items`, {
          category: "MILEAGE", date, description, vehicleId,
          originAddress: origin, destinationAddress: destination,
          roundTrip, manualKm: Math.round(Number(estimatedKm)),
          enteredKm: Math.round(Number(enteredKm)),
          overageJustification: overBound ? justification.trim() : undefined,
        });
      } else {
        await api.post(`/reports/${report!.id}/items`, {
          category, date, description,
          amountCents: Math.round(Number(amount) * 100),
        });
      }
      resetItemForm(); await refresh();
    } catch {
      setError(t("items.addError"));
    }
  }

  async function removeItem(itemId: string): Promise<void> {
    setError(null);
    try {
      await api.del(`/reports/${report!.id}/items/${itemId}`);
      await refresh();
    } catch {
      setError(t("items.removeError"));
    }
  }

  async function act(
    action: "submit" | "approve" | "reject" | "send-payment"
  ): Promise<void> {
    setError(null);
    try {
      await api.post(`/reports/${report!.id}/${action}`);
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  async function submitRevise(): Promise<void> {
    if (!reviseComment.trim()) return;
    setError(null);
    try {
      await api.post(`/reports/${report!.id}/revise`, { comment: reviseComment });
      setShowReviseForm(false); setReviseComment("");
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  async function payNow(input: MarkPaidInput): Promise<void> {
    setError(null);
    try {
      await markPaid(report!.id, input);
      setShowPayForm(false); await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  const allCategories: Category[] = ["MILEAGE", ...MONEY_CATEGORIES];

  return (
    <>
      {/* Back link */}
      <button
        className="pg-btn pg-btn--quiet"
        style={{ marginBottom: 18, padding: "6px 12px", fontSize: 12 }}
        onClick={() => navigate("/note-spese")}
      >
        <ArrowLeft size={14} strokeWidth={1.6} />
        {t("reports.back")}
      </button>

      {/* Hero header */}
      <PageHead
        eyebrow={t("reports.state")}
        title={report.title}
        right={<StateBadge state={report.state} />}
      />

      {/* Big total */}
      <div style={{ marginBottom: 24 }}>
        <div className="pg-eyebrow" style={{ marginBottom: 6 }}>{t("reports.total")}</div>
        <div
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 500,
            fontSize: 38,
            color: "var(--pg-ink)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatEuroFromCents(report.totalCents)}
        </div>
      </div>

      {/* IN_REVISION banner */}
      {report.state === "IN_REVISION" && revisionEvent && (
        <div
          style={{
            background: "var(--pg-blue-bg)",
            border: "1px solid var(--pg-blue)",
            borderRadius: "var(--r)",
            padding: "14px 18px",
            marginBottom: 24,
            display: "flex",
            gap: 12,
          }}
        >
          <AlertTriangle
            size={17}
            color="var(--pg-blue)"
            strokeWidth={1.6}
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <div>
            <div style={{ fontWeight: 600, color: "var(--pg-blue)", marginBottom: 4 }}>
              Revisione richiesta
            </div>
            <div style={{ fontSize: 13, color: "var(--pg-body)" }}>
              {revisionEvent.comment}
            </div>
            <div className="pg-meta" style={{ marginTop: 4 }}>
              {formatDateIt(revisionEvent.createdAt)}
            </div>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </p>
      )}

      {/* Items table */}
      <div style={{ marginBottom: 8 }}>
        <div className="pg-eyebrow" style={{ marginBottom: 14 }}>{t("items.heading")}</div>
      </div>

      {report.items.length === 0 ? (
        <p className="pg-meta">{t("items.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden", marginBottom: 0 }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("items.date")}</th>
                <th>{t("items.category")}</th>
                <th>{t("items.description")}</th>
                <th className="pg-num">{t("items.amount")}</th>
                {isOwner && editable && <th />}
              </tr>
            </thead>
            <tbody>
              {report.items.map((it) => (
                <tr key={it.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateIt(it.date)}</td>
                  <td><CatTag cat={it.category} /></td>
                  <td>
                    <div>{it.description}</div>
                    {it.category === "MILEAGE" && it.originAddress && (
                      <div className="pg-meta" style={{ marginTop: 2 }}>
                        {it.originAddress} → {it.destinationAddress}
                        {it.roundTrip && " (A/R)"}
                        {it.enteredKm != null && ` · ${it.enteredKm} km`}
                        {it.ratePerKm && ` · ${it.ratePerKm} €/km`}
                      </div>
                    )}
                    {it.overageJustification && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11.5,
                          color: "var(--pg-amber)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <AlertTriangle size={12} strokeWidth={1.6} />
                        {it.overageJustification}
                      </div>
                    )}
                  </td>
                  <td className="pg-num">{formatEuroFromCents(it.amountCents)}</td>
                  {isOwner && editable && (
                    <td>
                      <button
                        className="pg-btn pg-btn--danger"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => void removeItem(it.id)}
                      >
                        <X size={13} strokeWidth={1.6} />
                        {t("items.remove")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals strip */}
          <div
            style={{
              borderTop: "2px solid var(--pg-gold-line)",
              padding: "14px var(--cardpad)",
              display: "flex",
              alignItems: "center",
              gap: 24,
              flexWrap: "wrap",
              background: "var(--pg-card)",
            }}
          >
            {byCat.map(({ cat, cents }) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CatTag cat={cat} />
                <span className="pg-num" style={{ fontSize: 13 }}>
                  {formatEuroFromCents(cents)}
                </span>
              </div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600, color: "var(--pg-muted)", fontSize: 12 }}>
                {t("reports.total")}
              </span>
              <span
                className="pg-num"
                style={{
                  fontSize: 18,
                  fontFamily: "var(--serif)",
                  fontWeight: 500,
                  color: "var(--pg-ink)",
                }}
              >
                {formatEuroFromCents(report.totalCents)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Add-item form */}
      {isOwner && editable && (
        <div className="pg-card" style={{ padding: "var(--cardpad)", marginTop: 20 }}>
          <div className="pg-eyebrow" style={{ marginBottom: 14 }}>{t("items.add")}</div>
          <form
            onSubmit={addItem}
            style={{ display: "grid", gap: 12, maxWidth: 520 }}
          >
            <label className="pg-field">
              <span className="pg-label">{t("items.category")}</span>
              <select
                className="pg-select"
                value={category}
                onChange={(e) => { setCategory(e.target.value as Category); setQuote(null); }}
              >
                {allCategories.map((c) => (
                  <option key={c} value={c}>{t(`categories.${c}`)}</option>
                ))}
              </select>
            </label>

            <label className="pg-field">
              <span className="pg-label">{t("items.date")}</span>
              <input
                className="pg-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>

            <label className="pg-field">
              <span className="pg-label">{t("items.description")}</span>
              <input
                className="pg-input"
                placeholder={t("items.description")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            {category === "MILEAGE" ? (
              vehicles.length === 0 ? (
                <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13 }}>
                  {t("items.mileage.needVehicle")}
                </p>
              ) : (
                <>
                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.vehicle")}</span>
                    <select
                      className="pg-select"
                      value={vehicleId}
                      onChange={(e) => { setVehicleId(e.target.value); setQuote(null); }}
                      required
                    >
                      <option value="">{t("items.mileage.noVehicle")}</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} — {v.aciRate.make} {v.aciRate.model} ({v.aciRate.costPerKm} €/km)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.origin")}</span>
                    <input
                      className="pg-input"
                      placeholder={t("items.mileage.origin")}
                      value={origin}
                      onChange={(e) => { setOrigin(e.target.value); setQuote(null); }}
                      required
                    />
                  </label>

                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.destination")}</span>
                    <input
                      className="pg-input"
                      placeholder={t("items.mileage.destination")}
                      value={destination}
                      onChange={(e) => { setDestination(e.target.value); setQuote(null); }}
                      required
                    />
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={roundTrip}
                      onChange={(e) => { setRoundTrip(e.target.checked); setQuote(null); }}
                    />
                    <span style={{ fontSize: 13, color: "var(--pg-body)" }}>
                      {t("items.mileage.roundTrip")}
                    </span>
                  </label>

                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.estimatedKm")}</span>
                    <input
                      className="pg-input"
                      type="number" min="1" step="1"
                      value={estimatedKm}
                      onChange={(e) => { setEstimatedKm(e.target.value); setQuote(null); }}
                      required
                    />
                  </label>

                  <button
                    type="button"
                    className="pg-btn pg-btn--ghost"
                    onClick={() => void onCalculate()}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {t("items.mileage.calculate")}
                  </button>

                  {quote && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "var(--pg-green-bg)",
                        color: "var(--pg-green)",
                        borderRadius: 999,
                        padding: "5px 12px",
                        fontSize: 12.5,
                        fontWeight: 600,
                        alignSelf: "flex-start",
                      }}
                    >
                      <Check size={13} strokeWidth={2} />
                      {t("items.mileage.range")}: {quote.baselineKm}–{quote.upperBoundKm} km
                      {" · "}{t("items.mileage.ratePerKm")}: {quote.ratePerKm} €/km
                    </div>
                  )}

                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.enteredKm")}</span>
                    <input
                      className="pg-input"
                      type="number" min="1" step="1"
                      value={enteredKm}
                      onChange={(e) => setEnteredKm(e.target.value)}
                      disabled={!quote}
                      required
                    />
                  </label>

                  {overBound && (
                    <label className="pg-field">
                      <span className="pg-label" style={{ color: "var(--pg-amber)" }}>
                        {t("items.mileage.justification")}
                      </span>
                      <textarea
                        className="pg-textarea"
                        rows={3}
                        placeholder={t("items.mileage.justification")}
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        required
                      />
                    </label>
                  )}

                  <button
                    type="submit"
                    className="pg-btn pg-btn--gold"
                    disabled={!quote || (overBound && justification.trim() === "")}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {t("items.add")}
                  </button>
                </>
              )
            ) : (
              <>
                <label className="pg-field">
                  <span className="pg-label">{t("items.amount")}</span>
                  <input
                    className="pg-input"
                    type="number" step="0.01" min="0"
                    placeholder={t("items.amount")}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="pg-btn pg-btn--gold"
                  style={{ alignSelf: "flex-start" }}
                >
                  {t("items.add")}
                </button>
              </>
            )}
          </form>
        </div>
      )}

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 28,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        {isOwner && available.includes("submit") && (
          <button className="pg-btn pg-btn--primary" onClick={() => void act("submit")}>
            <Send size={14} strokeWidth={1.6} />
            {t("reports.submit")}
          </button>
        )}
        {canManage && (
          <>
            <button
              className="pg-btn pg-btn--ghost"
              onClick={() => { setShowReviseForm((v) => !v); setReviseComment(""); }}
            >
              {t("reports.revise")}
            </button>
            <button
              className="pg-btn pg-btn--danger"
              onClick={() => void act("reject")}
            >
              <X size={14} strokeWidth={1.6} />
              {t("reports.reject")}
            </button>
            <button
              className="pg-btn pg-btn--gold"
              onClick={() => void act("approve")}
            >
              <Check size={14} strokeWidth={1.6} />
              {t("reports.approve")}
            </button>
          </>
        )}
        {isFinance && available.includes("send-payment") && (
          <button className="pg-btn pg-btn--primary" onClick={() => void act("send-payment")}>
            {t("reports.sendPayment")}
          </button>
        )}
        {isFinance && available.includes("mark-paid") && !showPayForm && (
          <button className="pg-btn pg-btn--gold" onClick={() => setShowPayForm(true)}>
            {t("reports.markPaid")}
          </button>
        )}
        {isFinance && available.includes("mark-paid") && showPayForm && (
          <MarkPaidForm onSubmit={(input) => void payNow(input)} />
        )}
      </div>

      {/* Inline revise form */}
      {showReviseForm && (
        <div className="pg-card" style={{ padding: "var(--cardpad)", marginTop: 16, maxWidth: 520 }}>
          <div className="pg-eyebrow" style={{ marginBottom: 10 }}>
            {t("reports.revise")}
          </div>
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
              onClick={() => void submitRevise()}
            >
              {t("reports.revise")}
            </button>
            <button
              className="pg-btn pg-btn--ghost"
              onClick={() => { setShowReviseForm(false); setReviseComment(""); }}
            >
              {t("users.cancel")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
