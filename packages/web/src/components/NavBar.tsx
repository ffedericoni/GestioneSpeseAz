import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { hasAtLeast } from "@gsa/shared";
import { useAuth } from "../auth/AuthContext.js";

export function NavBar(): JSX.Element | null {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <nav
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: "12px 24px",
        borderBottom: "1px solid #ccc",
        fontFamily: "system-ui",
      }}
    >
      <Link to="/note-spese">{t("nav.reports")}</Link>
      <Link to="/veicoli">{t("nav.vehicles")}</Link>
      {hasAtLeast(user.role, "MANAGER") && <Link to="/approvazioni">{t("nav.approvals")}</Link>}
      {user.role === "ADMIN" && <Link to="/tabelle-aci">{t("nav.aci")}</Link>}
      {user.role === "ADMIN" && <Link to="/utenti">{t("nav.users")}</Link>}
      <span style={{ marginLeft: "auto" }}>{user.fullName}</span>
      <button onClick={() => void logout()}>{t("nav.logout")}</button>
    </nav>
  );
}
