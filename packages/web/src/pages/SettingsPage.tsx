import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type ToleranceSetting } from "../api/client.js";
import { PageHead } from "../components/chrome.js";

export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const [tolerance, setTolerance] = useState("10");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<ToleranceSetting>("/settings/mileage-tolerance")
      .then((s) => setTolerance(String(s.tolerancePercent)))
      .catch(() => setError(t("settings.loadError")));
  }, []);

  async function onSave(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setSaved(false);
    try {
      const result = await api.put<ToleranceSetting>("/settings/mileage-tolerance", {
        tolerancePercent: Number(tolerance),
      });
      setTolerance(String(result.tolerancePercent));
      setSaved(true);
    } catch {
      setError(t("settings.saveError"));
    }
  }

  const pct = Math.max(0, Math.min(100, Number(tolerance) || 0));

  return (
    <>
      <PageHead
        eyebrow={t("settings.title")}
        title="Impostazioni"
        accent="aziendali"
      />

      <div className="pg-card" style={{ padding: "var(--cardpad)", maxWidth: 480 }}>
        <form onSubmit={onSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <label className="pg-field">
            <span className="pg-label">{t("settings.tolerance")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                className="pg-input"
                type="number"
                min="0"
                max="100"
                step="1"
                value={tolerance}
                onChange={(e) => { setTolerance(e.target.value); setSaved(false); }}
                style={{ width: 90 }}
              />
              <span style={{ color: "var(--pg-muted)", fontSize: 13 }}>%</span>
            </div>
          </label>

          {/* Visual range bar */}
          <div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: "var(--pg-sand)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "var(--pg-gold)",
                  borderRadius: 999,
                  transition: "width 200ms",
                }}
              />
            </div>
            <div
              className="pg-meta"
              style={{ marginTop: 5, textAlign: "right" }}
            >
              {pct}%
            </div>
          </div>

          <button
            type="submit"
            className="pg-btn pg-btn--primary"
            style={{ alignSelf: "flex-start" }}
          >
            {t("settings.save")}
          </button>
        </form>

        {saved && (
          <p style={{ color: "var(--pg-green)", fontSize: 13, marginTop: 12 }}>
            {t("settings.saved")}
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </>
  );
}
