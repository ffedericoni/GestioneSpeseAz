import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Car } from "lucide-react";
import { api, type Vehicle, type AciRate } from "../api/client.js";
import { Switch } from "../components/ui.js";
import { PageHead } from "../components/chrome.js";

export function VehiclesPage(): JSX.Element {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [plate, setPlate] = useState("");
  const [search, setSearch] = useState("");
  const [rates, setRates] = useState<AciRate[]>([]);
  const [aciRateId, setAciRateId] = useState("");

  async function refresh(): Promise<void> {
    setVehicles(await api.get<Vehicle[]>("/vehicles"));
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  async function searchRates(e: FormEvent): Promise<void> {
    e.preventDefault();
    const found = await api.get<AciRate[]>(`/aci/rates?search=${encodeURIComponent(search)}`);
    setRates(found);
    setAciRateId(found[0]?.id ?? "");
  }

  async function addVehicle(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    try {
      await api.post("/vehicles", { label, aciRateId, plate: plate || null });
      setLabel(""); setPlate(""); setSearch(""); setRates([]); setAciRateId("");
      await refresh();
    } catch {
      setError(t("vehicles.createError"));
    }
  }

  async function toggleActive(v: Vehicle): Promise<void> {
    await api.patch(`/vehicles/${v.id}`, { active: !v.active });
    await refresh();
  }

  const rateLabel = (r: AciRate): string =>
    `${r.make} ${r.model} ${r.fuel} ${r.variant} (${r.year})`;

  return (
    <>
      <PageHead
        eyebrow={t("vehicles.title")}
        title="I miei"
        accent="veicoli"
      />

      {/* Add vehicle card */}
      <div className="pg-card" style={{ padding: "var(--cardpad)", marginBottom: 24 }}>
        <div className="pg-eyebrow" style={{ marginBottom: 14 }}>{t("vehicles.add")}</div>

        {/* ACI search */}
        <form onSubmit={searchRates} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <label className="pg-field" style={{ flex: 1 }}>
            <span className="pg-label">{t("vehicles.rateSearch")}</span>
            <input
              className="pg-input"
              placeholder={t("vehicles.rateSearch")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="pg-btn pg-btn--ghost"
            style={{ alignSelf: "flex-end" }}
          >
            {t("vehicles.search")}
          </button>
        </form>

        {/* Vehicle form */}
        <form
          onSubmit={addVehicle}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 560 }}
        >
          <label className="pg-field">
            <span className="pg-label">{t("vehicles.rate")}</span>
            <select
              className="pg-select"
              value={aciRateId}
              onChange={(e) => setAciRateId(e.target.value)}
              required
              style={{ gridColumn: "1 / -1" } as React.CSSProperties}
            >
              {rates.length === 0 ? (
                <option value="">{t("vehicles.noRate")}</option>
              ) : (
                rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {rateLabel(r)} — {r.costPerKm} €/km
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="pg-field">
            <span className="pg-label">{t("vehicles.label")}</span>
            <input
              className="pg-input"
              placeholder={t("vehicles.label")}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </label>

          <label className="pg-field">
            <span className="pg-label">{t("vehicles.plate")}</span>
            <input
              className="pg-input"
              placeholder={t("vehicles.plate")}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
          </label>

          {error && (
            <p
              role="alert"
              style={{
                color: "var(--pg-danger)",
                fontSize: 13,
                gridColumn: "1 / -1",
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="pg-btn pg-btn--gold"
            style={{ gridColumn: "1 / -1", justifySelf: "flex-start" }}
          >
            <Plus size={15} strokeWidth={2} />
            {t("vehicles.add")}
          </button>
        </form>
      </div>

      {/* Vehicles table */}
      {loading ? (
        <p className="pg-meta">{t("common.loading")}</p>
      ) : vehicles.length === 0 ? (
        <p className="pg-meta">{t("vehicles.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden" }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("vehicles.label")}</th>
                <th>{t("vehicles.plate")}</th>
                <th>{t("vehicles.rate")}</th>
                <th className="pg-num">€/km</th>
                <th>{t("vehicles.status.header")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} style={{ opacity: v.active ? 1 : 0.6 }}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "var(--r-sm)",
                          background: "var(--pg-gold-tint)",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Car size={16} color="var(--pg-gold-deep)" strokeWidth={1.6} />
                      </div>
                      <span style={{ fontWeight: 600, color: "var(--pg-ink)" }}>
                        {v.label}
                      </span>
                    </div>
                  </td>
                  <td>{v.plate ?? "—"}</td>
                  <td>{rateLabel(v.aciRate)}</td>
                  <td className="pg-num">{v.aciRate.costPerKm}</td>
                  <td>
                    <Switch
                      on={v.active}
                      onChange={() => void toggleActive(v)}
                    />
                  </td>
                  <td>
                    <button
                      className="pg-btn pg-btn--ghost"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => void toggleActive(v)}
                    >
                      {v.active ? t("vehicles.deactivate") : t("vehicles.activate")}
                    </button>
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
