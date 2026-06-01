import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { MarkPaidInput } from "../api/client.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MarkPaidForm({
  onSubmit,
}: {
  onSubmit: (input: MarkPaidInput) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState("");

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    onSubmit({ paidAt, paymentReference: reference.trim() || undefined });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
    >
      <label className="pg-field">
        <span className="pg-label">{t("payments.paidAt")}</span>
        <input
          className="pg-input"
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          required
          style={{ width: 150 }}
        />
      </label>
      <label className="pg-field">
        <span className="pg-label">{t("payments.reference")}</span>
        <input
          className="pg-input"
          placeholder={t("payments.reference")}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          style={{ width: 200 }}
        />
      </label>
      <button type="submit" className="pg-btn pg-btn--gold">
        <Check size={14} strokeWidth={2} />
        {t("payments.confirmPaid")}
      </button>
    </form>
  );
}
