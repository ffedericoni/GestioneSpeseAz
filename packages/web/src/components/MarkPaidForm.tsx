import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { MarkPaidInput } from "../api/client.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Small reusable form: a date (prefilled today) plus an optional payment
// reference. Used by both the Pagamenti queue and the report detail page.
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
    <form onSubmit={handleSubmit} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <label>
        {t("payments.paidAt")}{" "}
        <input
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          required
        />
      </label>
      <input
        placeholder={t("payments.reference")}
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />
      <button type="submit">{t("payments.confirmPaid")}</button>
    </form>
  );
}
