import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { actionsFor, MONEY_CATEGORIES, type MoneyCategory, type Category } from "@gsa/shared";
import {
  api,
  quoteMileage,
  type ReportDetail,
  type Vehicle,
  type MileageQuote,
} from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";

export function ReportDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New-item form state
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

  if (!report) return <p style={{ fontFamily: "system-ui", margin: "2rem" }}>{t("common.loading")}</p>;

  const isOwner = report.ownerId === user?.id;
  const editable =
    report.state === "CREATED" ||
    report.state === "READY_FOR_APPROVAL" ||
    report.state === "IN_REVISION";
  const available = actionsFor(report.state);
  const canManage = available.some((a) => a === "approve" || a === "reject" || a === "revise");

  const overBound = quote != null && Number(enteredKm) > quote.upperBoundKm;

  function resetItemForm(): void {
    setDescription("");
    setAmount("");
    setDate("");
    setVehicleId("");
    setOrigin("");
    setDestination("");
    setRoundTrip(false);
    setEstimatedKm("");
    setEnteredKm("");
    setJustification("");
    setQuote(null);
  }

  async function onCalculate(): Promise<void> {
    setError(null);
    try {
      const q = await quoteMileage({
        vehicleId,
        originAddress: origin,
        destinationAddress: destination,
        roundTrip,
        manualKm: Math.round(Number(estimatedKm)),
      });
      setQuote(q);
    } catch {
      setError(t("items.mileage.quoteError"));
    }
  }

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      if (category === "MILEAGE") {
        await api.post(`/reports/${report!.id}/items`, {
          category: "MILEAGE",
          date,
          description,
          vehicleId,
          originAddress: origin,
          destinationAddress: destination,
          roundTrip,
          manualKm: Math.round(Number(estimatedKm)),
          enteredKm: Math.round(Number(enteredKm)),
          overageJustification: overBound ? justification : undefined,
        });
      } else {
        await api.post(`/reports/${report!.id}/items`, {
          category,
          date,
          description,
          amountCents: Math.round(Number(amount) * 100),
        });
      }
      resetItemForm();
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

  // MILEAGE plus the money categories.
  const allCategories: Category[] = ["MILEAGE", ...MONEY_CATEGORIES];

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
          <select
            aria-label={t("items.category")}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as Category);
              setQuote(null);
            }}
          >
            {allCategories.map((c) => (
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

          {category === "MILEAGE" ? (
            vehicles.length === 0 ? (
              <p role="alert" style={{ color: "#dc2626" }}>{t("items.mileage.needVehicle")}</p>
            ) : (
              <>
                <select
                  aria-label={t("items.mileage.vehicle")}
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
                <input
                  placeholder={t("items.mileage.origin")}
                  value={origin}
                  onChange={(e) => { setOrigin(e.target.value); setQuote(null); }}
                  required
                />
                <input
                  placeholder={t("items.mileage.destination")}
                  value={destination}
                  onChange={(e) => { setDestination(e.target.value); setQuote(null); }}
                  required
                />
                <label>
                  <input
                    type="checkbox"
                    checked={roundTrip}
                    onChange={(e) => { setRoundTrip(e.target.checked); setQuote(null); }}
                  />{" "}
                  {t("items.mileage.roundTrip")}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t("items.mileage.estimatedKm")}
                  aria-label={t("items.mileage.estimatedKm")}
                  value={estimatedKm}
                  onChange={(e) => { setEstimatedKm(e.target.value); setQuote(null); }}
                  required
                />
                <button type="button" onClick={() => void onCalculate()}>
                  {t("items.mileage.calculate")}
                </button>
                {quote && (
                  <p style={{ color: "#15803d" }}>
                    {t("items.mileage.range")}: {quote.baselineKm}–{quote.upperBoundKm} km ·{" "}
                    {t("items.mileage.ratePerKm")}: {quote.ratePerKm}
                  </p>
                )}
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder={t("items.mileage.enteredKm")}
                  aria-label={t("items.mileage.enteredKm")}
                  value={enteredKm}
                  onChange={(e) => setEnteredKm(e.target.value)}
                  disabled={!quote}
                  required
                />
                {overBound && (
                  <textarea
                    placeholder={t("items.mileage.justification")}
                    aria-label={t("items.mileage.justification")}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    required
                  />
                )}
                <button type="submit" disabled={!quote}>{t("items.add")}</button>
              </>
            )
          ) : (
            <>
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
            </>
          )}
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
