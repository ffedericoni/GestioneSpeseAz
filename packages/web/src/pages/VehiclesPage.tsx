import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type Vehicle, type AciRate } from "../api/client.js";

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

  useEffect(() => {
    void refresh();
  }, []);

  async function searchRates(e: FormEvent): Promise<void> {
    e.preventDefault();
    const found = await api.get<AciRate[]>(`/aci/rates?search=${encodeURIComponent(search)}`);
    setRates(found);
    setAciRateId(found[0]?.id ?? "");
  }

  async function addVehicle(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/vehicles", { label, aciRateId, plate: plate || null });
      setLabel("");
      setPlate("");
      await refresh();
    } catch {
      setError(t("vehicles.createError"));
    }
  }

  async function toggleActive(v: Vehicle): Promise<void> {
    await api.patch(`/vehicles/${v.id}`, { active: !v.active });
    await refresh();
  }

  const rateLabel = (r: AciRate): string => `${r.make} ${r.model} ${r.fuel} ${r.variant} (${r.year})`;

  return (
    <main style={{ maxWidth: 900, margin: "1rem auto", fontFamily: "system-ui" }}>
      <h1>{t("vehicles.title")}</h1>

      <form onSubmit={searchRates} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder={t("vehicles.rateSearch")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit">{t("vehicles.search")}</button>
      </form>

      <form onSubmit={addVehicle} style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 24 }}>
        <select aria-label={t("vehicles.rate")} value={aciRateId} onChange={(e) => setAciRateId(e.target.value)} required>
          {rates.length === 0 ? (
            <option value="">{t("vehicles.noRate")}</option>
          ) : (
            rates.map((r) => (
              <option key={r.id} value={r.id}>{rateLabel(r)} — {r.costPerKm} €/km</option>
            ))
          )}
        </select>
        <input placeholder={t("vehicles.label")} value={label} onChange={(e) => setLabel(e.target.value)} required />
        <input placeholder={t("vehicles.plate")} value={plate} onChange={(e) => setPlate(e.target.value)} />
        <button type="submit">{t("vehicles.add")}</button>
      </form>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : vehicles.length === 0 ? (
        <p>{t("vehicles.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("vehicles.label")}</th>
              <th style={{ textAlign: "left" }}>{t("vehicles.plate")}</th>
              <th style={{ textAlign: "left" }}>{t("vehicles.rate")}</th>
              <th style={{ textAlign: "left" }}>{t("users.role")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td>{v.label}</td>
                <td>{v.plate ?? "—"}</td>
                <td>{rateLabel(v.aciRate)}</td>
                <td>{v.active ? t("vehicles.status.active") : t("vehicles.status.inactive")}</td>
                <td>
                  <button onClick={() => void toggleActive(v)}>
                    {v.active ? t("vehicles.deactivate") : t("vehicles.activate")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
