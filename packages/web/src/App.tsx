import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UsersPage } from "./pages/UsersPage.js";

function Routed(): JSX.Element {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) return <p style={{ fontFamily: "system-ui", margin: "2rem" }}>{t("common.loading")}</p>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/utenti" replace /> : <LoginPage />} />
      <Route path="/utenti" element={user ? <UsersPage /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? "/utenti" : "/login"} replace />} />
    </Routes>
  );
}

export function App(): JSX.Element {
  return (
    <AuthProvider>
      <Routed />
    </AuthProvider>
  );
}
