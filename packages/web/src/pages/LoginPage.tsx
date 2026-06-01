import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext.js";

export function LoginPage(): JSX.Element {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(false);
    setBusy(true);
    try {
      await login(email, password);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pg pg-login">
      {/* Left panel */}
      <div className="pg-login__left">
        <img src="/pg-logo.png" alt="Pellegrini" style={{ height: 28, display: "block" }} />
        <h1
          className="pg-title"
          style={{ fontSize: 44, maxWidth: 340, lineHeight: 1.08 }}
        >
          Gestione <em>spese</em>
        </h1>
        <p style={{ color: "var(--pg-body)", fontSize: 14, maxWidth: 300, lineHeight: 1.6 }}>
          Registra, invia e monitora i rimborsi aziendali in un unico posto.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="pg-login__right">
        <div style={{ width: "100%", maxWidth: 360 }}>
          <div className="pg-eyebrow pg-eyebrow--red" style={{ marginBottom: 10 }}>
            Accedi al tuo account
          </div>
          <h2 className="pg-title" style={{ fontSize: 26, marginBottom: 28 }}>
            {t("login.heading")}
          </h2>

          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label className="pg-field">
              <span className="pg-label">{t("login.email")}</span>
              <input
                className="pg-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </label>

            <label className="pg-field">
              <span className="pg-label">{t("login.password")}</span>
              <input
                className="pg-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>

            {error && (
              <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, margin: 0 }}>
                {t("login.error")}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="pg-btn pg-btn--primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
            >
              {t("login.submit")}
            </button>

            {/* Visual-only forgot-password link */}
            <button
              type="button"
              className="pg-btn pg-btn--quiet"
              style={{
                width: "100%",
                justifyContent: "center",
                color: "var(--pg-gold-deep)",
                background: "transparent",
                border: "none",
                cursor: "default",
              }}
            >
              Password dimenticata?
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
