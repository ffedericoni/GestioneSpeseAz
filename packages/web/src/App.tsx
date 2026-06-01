import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { PageShell } from "./components/chrome.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UsersPage } from "./pages/UsersPage.js";
import { ReportsPage } from "./pages/ReportsPage.js";
import { ReportDetailPage } from "./pages/ReportDetailPage.js";
import { ApprovalsPage } from "./pages/ApprovalsPage.js";
import { PagamentiPage } from "./pages/PagamentiPage.js";
import { VehiclesPage } from "./pages/VehiclesPage.js";
import { AciRatesPage } from "./pages/AciRatesPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

function Routed(): JSX.Element {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <p className="pg" style={{ margin: "2rem" }}>
        {t("common.loading")}
      </p>
    );
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
    <PageShell>
      <Routes>
        <Route path="/note-spese" element={<ReportsPage />} />
        <Route path="/note-spese/:id" element={<ReportDetailPage />} />
        <Route path="/approvazioni" element={<ApprovalsPage />} />
        <Route path="/pagamenti" element={<PagamentiPage />} />
        <Route path="/utenti" element={<UsersPage />} />
        <Route path="/veicoli" element={<VehiclesPage />} />
        <Route path="/tabelle-aci" element={<AciRatesPage />} />
        <Route path="/impostazioni" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/note-spese" replace />} />
      </Routes>
    </PageShell>
  );
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  );
}
