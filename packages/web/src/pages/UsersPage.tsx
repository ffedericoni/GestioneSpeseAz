import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type Role } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.js";

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
  const { user, logout } = useAuth();
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
    setUsers(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setFormError(null);
    try {
      await api.post("/users", {
        fullName,
        email,
        password,
        role,
        managerId: managerId || null,
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("EMPLOYEE");
      setManagerId("");
      await refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setFormError(code === "EMAIL_GIA_REGISTRATA" ? t("users.emailTaken") : t("users.createError"));
    }
  }

  async function toggleActive(u: UserRow): Promise<void> {
    await api.patch(`/users/${u.id}`, { active: !u.active });
    await refresh();
  }

  const managers = users.filter((u) => u.role === "MANAGER" || u.role === "ADMIN");

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{t("users.title")}</h1>
        <div>
          <span style={{ marginRight: 12 }}>{user?.fullName}</span>
          <button onClick={() => void logout()}>{t("nav.logout")}</button>
        </div>
      </header>

      <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 24 }}>
        <h2>{t("users.newUser")}</h2>
        <form onSubmit={onCreate} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
          <input placeholder={t("users.fullName")} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <input type="email" placeholder={t("users.email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder={t("login.password")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{t(`roles.${r}`)}</option>
            ))}
          </select>
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">{t("users.noManager")}</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>{m.fullName}</option>
            ))}
          </select>
          {formError && <p role="alert" style={{ color: "#dc2626" }}>{formError}</p>}
          <button type="submit">{t("users.create")}</button>
        </form>
      </section>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <p>{t("users.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>{t("users.fullName")}</th>
              <th style={{ textAlign: "left" }}>{t("users.email")}</th>
              <th style={{ textAlign: "left" }}>{t("users.role")}</th>
              <th style={{ textAlign: "left" }}>{t("users.active")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.fullName}</td>
                <td>{u.email}</td>
                <td>{t(`roles.${u.role}`)}</td>
                <td>{u.active ? t("users.status.active") : t("users.status.inactive")}</td>
                <td>
                  <button onClick={() => void toggleActive(u)}>
                    {u.active ? t("users.deactivate") : t("users.activate")}
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
