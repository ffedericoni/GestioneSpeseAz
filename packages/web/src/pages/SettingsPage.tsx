import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type ToleranceSetting } from "../api/client.js";

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
    e.preventDefault();
    setError(null);
    setSaved(false);
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

  return (
    <main style={{ maxWidth: 480, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("settings.title")}</h1>
      <form onSubmit={onSave} style={{ display: "grid", gap: 8 }}>
        <label>
          {t("settings.tolerance")}
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            aria-label={t("settings.tolerance")}
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>
        <button type="submit">{t("settings.save")}</button>
      </form>
      {saved && <p style={{ color: "#15803d" }}>{t("settings.saved")}</p>}
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
    </main>
  );
}
