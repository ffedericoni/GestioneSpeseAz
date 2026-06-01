import {
  createContext,
  useContext,
  useState,
  useEffect,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Receipt,
  Car,
  CheckCircle2,
  Wallet,
  Table,
  Users,
  Settings,
  LogOut,
  Search,
  ChevronRight,
} from "lucide-react";
import { hasAtLeast } from "@gsa/shared";
import { useAuth } from "../auth/AuthContext.js";
import { Avatar } from "./ui.js";

/* ── Detail-title context (for ReportDetailPage breadcrumb) ─── */

export const DetailTitleCtx = createContext<Dispatch<SetStateAction<string>> | null>(null);

export function useSetDetailTitle(title: string): void {
  const set = useContext(DetailTitleCtx);
  useEffect(() => {
    if (set && title) set(title);
    return () => {
      if (set) set("");
    };
  }, [set, title]);
}

/* ── Rail ───────────────────────────────────────────────────── */

type LucideIcon = typeof Receipt;

interface NavItem {
  Icon: LucideIcon;
  route: string;
  label: string;
}

function useNavItems(): NavItem[] {
  const { user } = useAuth();
  if (!user) return [];
  const items: NavItem[] = [
    { Icon: Receipt, route: "/note-spese",   label: "Note spese" },
    { Icon: Car,     route: "/veicoli",      label: "Veicoli"    },
  ];
  if (hasAtLeast(user.role, "MANAGER"))
    items.push({ Icon: CheckCircle2, route: "/approvazioni", label: "Approvazioni" });
  if (hasAtLeast(user.role, "FINANCE"))
    items.push({ Icon: Wallet, route: "/pagamenti", label: "Pagamenti" });
  if (user.role === "ADMIN") {
    items.push({ Icon: Table, route: "/tabelle-aci", label: "Tabelle ACI" });
    items.push({ Icon: Users, route: "/utenti",      label: "Utenti"      });
  }
  return items;
}

function Rail(): JSX.Element {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const items = useNavItems();

  if (!user) return <></>;

  function isActive(route: string): boolean {
    return location.pathname === route || location.pathname.startsWith(route + "/");
  }

  return (
    <nav
      style={{
        width: 66,
        background: "var(--pg-rail)",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 0",
        gap: 4,
      }}
    >
      <img
        src="/pg-emblem.png"
        alt="Pellegrini"
        width={34}
        height={34}
        style={{ display: "block", objectFit: "contain" }}
      />
      <div style={{ height: 14 }} />

      {items.map(({ Icon, route, label }) => {
        const active = isActive(route);
        return (
          <button
            key={route}
            title={label}
            aria-label={label}
            onClick={() => navigate(route)}
            className={`pg-rail-btn${active ? " pg-rail-btn--active" : ""}`}
          >
            <Icon size={20} strokeWidth={active ? 1.9 : 1.6} />
          </button>
        );
      })}

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "center",
        }}
      >
        {user.role === "ADMIN" && (() => {
          const settingsActive = isActive("/impostazioni");
          return (
            <button
              title="Impostazioni"
              aria-label="Impostazioni"
              onClick={() => navigate("/impostazioni")}
              className={`pg-rail-btn${settingsActive ? " pg-rail-btn--active" : ""}`}
            >
              <Settings size={20} strokeWidth={settingsActive ? 1.9 : 1.6} />
            </button>
          );
        })()}
        <button
          title="Esci"
          aria-label="Esci"
          onClick={() => void logout()}
          className="pg-rail-btn"
        >
          <LogOut size={20} strokeWidth={1.6} />
        </button>
      </div>
    </nav>
  );
}

/* ── Topbar ─────────────────────────────────────────────────── */

const CRUMB_LABELS: Record<string, string> = {
  "/note-spese":   "Note spese",
  "/approvazioni": "Approvazioni",
  "/pagamenti":    "Pagamenti",
  "/veicoli":      "Veicoli",
  "/tabelle-aci":  "Tabelle ACI",
  "/impostazioni": "Impostazioni",
  "/utenti":       "Utenti",
};

function buildCrumb(pathname: string, detailTitle: string): string[] {
  if (pathname.startsWith("/note-spese/")) {
    return ["Note spese", detailTitle || "…"];
  }
  const label = CRUMB_LABELS[pathname];
  return label ? [label] : ["—"];
}

function Topbar({ detailTitle }: { detailTitle: string }): JSX.Element {
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const crumb = buildCrumb(location.pathname, detailTitle);

  return (
    <header
      style={{
        height: 58,
        flexShrink: 0,
        background: "var(--pg-card)",
        borderBottom: "1px solid var(--pg-rule)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 24px",
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/pg-logo.png" alt="Pellegrini" style={{ height: 21, display: "block" }} />
        <span style={{ width: 1, height: 20, background: "var(--pg-rule-2)" }} />
        <span style={{ fontWeight: 600, color: "var(--pg-muted)", fontSize: 12.5 }}>
          Gestione Spese
        </span>
      </div>

      {/* Breadcrumb */}
      <nav
        className="pg-meta"
        style={{ display: "flex", alignItems: "center", gap: 7, marginLeft: 18 }}
      >
        {crumb.map((c, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {i > 0 && (
              <ChevronRight size={13} color="var(--pg-faint)" strokeWidth={1.6} />
            )}
            <span
              style={{
                color: i === crumb.length - 1 ? "var(--pg-ink)" : "var(--pg-muted)",
                fontWeight: i === crumb.length - 1 ? 600 : 500,
              }}
            >
              {c}
            </span>
          </span>
        ))}
      </nav>

      {/* Right side */}
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {/* Search affordance (visual only — not interactive) */}
        <div
          aria-hidden="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--pg-muted)",
            border: "1px solid var(--pg-rule-2)",
            borderRadius: 999,
            padding: "6px 12px",
            fontSize: 12.5,
          }}
        >
          <Search size={15} strokeWidth={1.6} />
          <span>Cerca…</span>
        </div>

        {/* User */}
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Avatar name={user.fullName} />
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600, color: "var(--pg-ink)", fontSize: 12.5 }}>
                {user.fullName}
              </div>
              <div className="pg-meta" style={{ fontSize: 10.5 }}>
                {t(`roles.${user.role}`)}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

/* ── PageShell ──────────────────────────────────────────────── */

export function PageShell({ children }: { children: ReactNode }): JSX.Element {
  const [detailTitle, setDetailTitle] = useState("");
  return (
    <DetailTitleCtx.Provider value={setDetailTitle}>
      <div
        className="pg"
        style={{
          display: "flex",
          height: "100vh",
          overflow: "hidden",
          background: "var(--pg-paper)",
        }}
      >
        <Rail />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Topbar detailTitle={detailTitle} />
          <div
            className="pg-scroll"
            style={{ flex: 1, overflowY: "auto", padding: "26px 40px 40px" }}
          >
            <div style={{ maxWidth: 1040, margin: "0 auto" }}>{children}</div>
          </div>
        </div>
      </div>
    </DetailTitleCtx.Provider>
  );
}

/* ── PageHead ───────────────────────────────────────────────── */

interface PageHeadProps {
  eyebrow?: string;
  title: string;
  accent?: string;
  sub?: string;
  right?: ReactNode;
}

export function PageHead({
  eyebrow,
  title,
  accent,
  sub,
  right,
}: PageHeadProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 24,
        marginBottom: 22,
      }}
    >
      <div>
        {eyebrow && (
          <div className="pg-eyebrow pg-eyebrow--red" style={{ marginBottom: 9 }}>
            {eyebrow}
          </div>
        )}
        <h1 className="pg-title" style={{ fontSize: 30 }}>
          {title}
          {accent && <em> {accent}</em>}
        </h1>
        {sub && (
          <div className="pg-meta" style={{ marginTop: 8, fontSize: 12.5 }}>
            {sub}
          </div>
        )}
      </div>
      {right && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {right}
        </div>
      )}
    </div>
  );
}
