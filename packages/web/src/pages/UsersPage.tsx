import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { api, type Role } from "../api/client.js";
import { RoleChip, Switch } from "../components/ui.js";
import { PageHead } from "../components/chrome.js";

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  managerId: string | null;
  active: boolean;
}

const ROLE_OPTIONS: Role[] = ["EMPLOYEE", "MANAGER", "FINANCE", "ADMIN"];

export function UsersPage(): JSX.Element {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [managerId, setManagerId] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const list = await api.get<UserRow[]>("/users");
    setUsers(list); setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault(); setFormError(null);
    if (role !== "ADMIN" && !managerId) {
      setFormError(t("users.approverRequired")); return;
    }
    try {
      await api.post("/users", {
        fullName, email, password, role,
        managerId: managerId || null,
      });
      setFullName(""); setEmail(""); setPassword("");
      setRole("EMPLOYEE"); setManagerId("");
      await refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setFormError(
        code === "EMAIL_GIA_REGISTRATA"    ? t("users.emailTaken")       :
        code === "APPROVATORE_OBBLIGATORIO" ? t("users.approverRequired") :
        t("users.createError")
      );
    }
  }

  async function toggleActive(u: UserRow): Promise<void> {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    await refresh();
  }

  const managers = users.filter((u) => u.role === "MANAGER" || u.role === "ADMIN");
  const managerName = (id: string | null) =>
    id ? (users.find((u) => u.id === id)?.fullName ?? "—") : t("users.noManager");

  return (
    <>
      <PageHead
        eyebrow={t("users.title")}
        title="Gestione"
        accent="utenti"
      />

      {/* New user card */}
      <div className="pg-card" style={{ padding: "var(--cardpad)", marginBottom: 24 }}>
        <div className="pg-eyebrow" style={{ marginBottom: 14 }}>{t("users.newUser")}</div>
        <form
          onSubmit={onCreate}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            maxWidth: 560,
          }}
        >
          <label className="pg-field">
            <span className="pg-label">{t("users.fullName")}</span>
            <input
              className="pg-input"
              placeholder={t("users.fullName")}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>

          <label className="pg-field">
            <span className="pg-label">{t("users.email")}</span>
            <input
              className="pg-input"
              type="email"
              placeholder={t("users.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="pg-field">
            <span className="pg-label">{t("login.password")}</span>
            <input
              className="pg-input"
              type="password"
              placeholder={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>

          <label className="pg-field">
            <span className="pg-label">{t("users.role")}</span>
            <select
              className="pg-select"
              value={role}
              onChange={(e) => {
                const r = e.target.value as Role;
                setRole(r);
                if (r === "ADMIN") setManagerId("");
              }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{t(`roles.${r}`)}</option>
              ))}
            </select>
          </label>

          <label className="pg-field" style={{ gridColumn: "1 / -1" }}>
            <span className="pg-label">
              {t("users.approver")}
              <span style={{ fontWeight: 400, marginLeft: 6, textTransform: "none", letterSpacing: 0 }}>
                — {t("users.approverHint")}
              </span>
            </span>
            <select
              className="pg-select"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              required={role !== "ADMIN"}
            >
              {role === "ADMIN" ? (
                <option value="">{t("users.noManagerAdmin")}</option>
              ) : (
                <option value="" disabled>{t("users.selectApprover")}</option>
              )}
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.fullName}</option>
              ))}
            </select>
          </label>

          {formError && (
            <p
              role="alert"
              style={{
                color: "var(--pg-danger)",
                fontSize: 13,
                gridColumn: "1 / -1",
                margin: 0,
              }}
            >
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="pg-btn pg-btn--gold"
            style={{ gridColumn: "1 / -1", justifySelf: "flex-start" }}
          >
            <Plus size={15} strokeWidth={2} />
            {t("users.create")}
          </button>
        </form>
      </div>

      {/* Users table */}
      {loading ? (
        <p className="pg-meta">{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <p className="pg-meta">{t("users.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden" }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("users.fullName")}</th>
                <th>{t("users.email")}</th>
                <th>{t("users.role")}</th>
                <th>{t("users.manager")}</th>
                <th>{t("users.status.header", { defaultValue: "Stato" })}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : 0.6 }}>
                  <td style={{ fontWeight: 600, color: "var(--pg-ink)" }}>{u.fullName}</td>
                  <td className="pg-meta">{u.email}</td>
                  <td><RoleChip role={u.role} /></td>
                  <td>{managerName(u.managerId)}</td>
                  <td>
                    <Switch on={u.active} onChange={() => void toggleActive(u)} />
                  </td>
                  <td>
                    <button
                      className="pg-btn pg-btn--ghost"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => void toggleActive(u)}
                    >
                      {u.active ? t("users.deactivate") : t("users.activate")}
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
