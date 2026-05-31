import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { NavBar } from "./components/NavBar.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { ReportDetailPage } from "./pages/ReportDetailPage.js";
import { ApprovalsPage } from "./pages/ApprovalsPage.js";
import { VehiclesPage } from "./pages/VehiclesPage.js";
import { AciRatesPage } from "./pages/AciRatesPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

function Routed(): JSX.Element {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return <p style={{ fontFamily: "system-ui", margin: "2rem" }}>{t("common.loading")}</p>;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/note-spese" element={<ReportsPage />} />
        <Route path="/note-spese/:id" element={<ReportDetailPage />} />
        <Route path="/approvazioni" element={<ApprovalsPage />} />
        <Route path="/utenti" element={<UsersPage />} />
        <Route path="/veicoli" element={<VehiclesPage />} />
        <Route path="/tabelle-aci" element={<AciRatesPage />} />
        <Route path="/impostazioni" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/note-spese" replace />} />
      </Routes>
    </>
  );
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  );
}
