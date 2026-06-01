# Pellegrini Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the entire `packages/web` React app with the Gruppo Pellegrini brand using token-driven CSS classes, replacing all bare inline styles + system-ui with the Pellegrini design system.

**Architecture:** Option A — infrastructure first, then shared atoms, then chrome, then pages in sequence. Each page keeps its existing data-fetching and API logic; only markup and styling change. One behavioural exception: `window.prompt` on the revise action is replaced with an inline textarea form.

**Tech Stack:** React 18, TypeScript, Vite, react-router-dom v6, react-i18next, lucide-react (new dep), pellegrini.css (design token stylesheet from handoff)

---

## File map

| Action | Path |
|---|---|
| Copy+patch | `packages/web/src/pellegrini.css` |
| Copy | `packages/web/public/pg-logo.png` |
| Copy | `packages/web/public/pg-emblem.png` |
| Modify | `packages/web/package.json` |
| Modify | `packages/web/src/main.tsx` |
| **Create** | `packages/web/src/components/ui.tsx` |
| **Create** | `packages/web/src/components/chrome.tsx` |
| Modify | `packages/web/src/App.tsx` |
| Delete | `packages/web/src/components/NavBar.tsx` |
| Modify | `packages/web/src/pages/LoginPage.tsx` |
| Modify | `packages/web/src/pages/ReportsPage.tsx` |
| Modify | `packages/web/src/pages/ReportDetailPage.tsx` |
| Modify | `packages/web/src/pages/ApprovalsPage.tsx` |
| Modify | `packages/web/src/pages/PagamentiPage.tsx` |
| Modify | `packages/web/src/components/MarkPaidForm.tsx` |
| Modify | `packages/web/src/pages/VehiclesPage.tsx` |
| Modify | `packages/web/src/pages/AciRatesPage.tsx` |
| Modify | `packages/web/src/pages/SettingsPage.tsx` |
| Modify | `packages/web/src/pages/UsersPage.tsx` |

---

## Task 1: Infrastructure — CSS, assets, lucide-react

**Files:**
- Create: `packages/web/src/pellegrini.css` (copied from handoff + overrides)
- Create: `packages/web/public/pg-logo.png`
- Create: `packages/web/public/pg-emblem.png`
- Modify: `packages/web/package.json`
- Modify: `packages/web/src/main.tsx`

- [ ] **Step 1: Copy CSS from the handoff and append overrides**

Copy `design_handoff_pellegrini/pellegrini.css` to `packages/web/src/pellegrini.css`, then append the following block at the very end of the file:

```css
/* ============================================================
   Project overrides: compact + sharp preset, extra utilities
   ============================================================ */
:root {
  --r:        3px;
  --r-sm:     2px;
  --rowpad-y: 7px;
  --cardpad:  18px;
  --ui-fs:    13px;
}

/* Base reset */
html, body, #root { height: 100%; margin: 0; padding: 0; }
body { background: var(--pg-paper); }

/* Rail nav button */
.pg-rail-btn {
  width: 44px; height: 44px; border-radius: 11px; border: none; cursor: pointer;
  display: grid; place-items: center; flex-shrink: 0;
  background: transparent; color: var(--pg-rail-fg);
  transition: background 180ms, color 180ms;
}
.pg-rail-btn:hover { background: var(--pg-rail-2); }
.pg-rail-btn--active { background: var(--pg-gold) !important; color: #2c2e26 !important; }

/* Monospace utility */
.pg-mono { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 12px; }

/* Login split layout */
.pg-login { display: flex; height: 100vh; }
.pg-login__left {
  width: 40%; background: var(--pg-sand); display: flex;
  flex-direction: column; justify-content: center;
  align-items: flex-start; padding: 60px 56px; gap: 20px;
}
.pg-login__right {
  flex: 1; background: var(--pg-paper); display: flex;
  justify-content: center; align-items: center; padding: 40px;
}
```

- [ ] **Step 2: Copy logo and emblem assets**

```bash
copy "design_handoff_pellegrini\assets\pg-logo.png" "packages\web\public\pg-logo.png"
copy "design_handoff_pellegrini\assets\pg-emblem.png" "packages\web\public\pg-emblem.png"
```

- [ ] **Step 3: Add lucide-react to package.json**

In `packages/web/package.json`, add to `"dependencies"`:
```json
"lucide-react": "^0.460.0"
```

- [ ] **Step 4: Install dependency**

```bash
cd packages/web && npm install
```

Expected: resolves without error, `lucide-react` appears in `node_modules`.

- [ ] **Step 5: Import CSS in main.tsx**

Replace the full content of `packages/web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import "./i18n.js";
import "./pellegrini.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/pellegrini.css packages/web/public/pg-logo.png packages/web/public/pg-emblem.png packages/web/package.json packages/web/src/main.tsx packages/web/package-lock.json
git commit -m "feat(web): add pellegrini.css, assets, lucide-react"
```

---

## Task 2: Shared atoms — `ui.tsx`

**Files:**
- Create: `packages/web/src/components/ui.tsx`

- [ ] **Step 1: Create `packages/web/src/components/ui.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { Route, Building2, Send, FileText } from "lucide-react";
import type { Category, ReportState, Role } from "../api/client.js";

/* ── StateBadge ─────────────────────────────────────────────── */

const STATE_STYLE: Record<ReportState, { fg: string; bg: string }> = {
  CREATED:            { fg: "var(--pg-slate)",  bg: "var(--pg-slate-bg)"    },
  READY_FOR_APPROVAL: { fg: "var(--pg-amber)",  bg: "var(--pg-amber-bg)"    },
  IN_REVISION:        { fg: "var(--pg-blue)",   bg: "var(--pg-blue-bg)"     },
  APPROVED:           { fg: "var(--pg-green)",  bg: "var(--pg-green-bg)"    },
  REJECTED:           { fg: "var(--pg-danger)", bg: "var(--pg-danger-tint)" },
  SENT_FOR_PAYMENT:   { fg: "var(--pg-blue)",   bg: "var(--pg-blue-bg)"     },
  PAID:               { fg: "var(--pg-green)",  bg: "var(--pg-green-bg)"    },
};

export function StateBadge({ state }: { state: ReportState }): JSX.Element {
  const { t } = useTranslation();
  const s = STATE_STYLE[state] ?? STATE_STYLE.CREATED;
  return (
    <span className="pg-badge" style={{ color: s.fg, background: s.bg }}>
      <span className="dot" />
      {t(`states.${state}`)}
    </span>
  );
}

/* ── CatTag ─────────────────────────────────────────────────── */

type IconComponent = typeof Route;

const CAT_MAP: Record<Category, { color: string; Icon: IconComponent }> = {
  MILEAGE:       { color: "#2c5d86", Icon: Route    },
  MEALS_LODGING: { color: "#a9711a", Icon: Building2 },
  TRANSPORT:     { color: "#2f7d52", Icon: Send      },
  OTHER:         { color: "#6b6259", Icon: FileText  },
};

export function CatTag({
  cat,
  withIcon,
}: {
  cat: Category;
  withIcon?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const { color, Icon } = CAT_MAP[cat] ?? CAT_MAP.OTHER;
  return (
    <span className="pg-cat">
      {withIcon ? (
        <Icon size={15} color={color} strokeWidth={1.6} />
      ) : (
        <span className="swatch" style={{ background: color }} />
      )}
      {t(`categories.${cat}`)}
    </span>
  );
}

/* ── RoleChip ───────────────────────────────────────────────── */

const ROLE_CHIP: Record<Role, { fg: string; bg: string }> = {
  ADMIN:    { fg: "var(--pg-gold-deep)", bg: "var(--pg-gold-tint)" },
  MANAGER:  { fg: "var(--pg-blue)",      bg: "var(--pg-blue-bg)"   },
  FINANCE:  { fg: "var(--pg-green)",     bg: "var(--pg-green-bg)"  },
  EMPLOYEE: { fg: "var(--pg-slate)",     bg: "var(--pg-sand)"      },
};

export function RoleChip({ role }: { role: Role }): JSX.Element {
  const { t } = useTranslation();
  const { fg, bg } = ROLE_CHIP[role] ?? ROLE_CHIP.EMPLOYEE;
  return (
    <span className="pg-badge" style={{ color: fg, background: bg, fontSize: 11 }}>
      {t(`roles.${role}`)}
    </span>
  );
}

/* ── Avatar ─────────────────────────────────────────────────── */

export function Avatar({
  name,
  size = 32,
}: {
  name: string;
  size?: number;
}): JSX.Element {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        flexShrink: 0,
        background: "var(--pg-sand-2)",
        color: "var(--pg-ink)",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--serif)",
        fontWeight: 600,
        fontSize: size * 0.4,
      }}
    >
      {initials}
    </div>
  );
}

/* ── Switch ─────────────────────────────────────────────────── */

export function Switch({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 34,
        height: 19,
        borderRadius: 999,
        flexShrink: 0,
        background: on ? "var(--pg-gold-deep)" : "var(--pg-sand-2)",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        position: "relative",
        display: "inline-block",
        transition: "background 180ms",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          ...(on ? { right: 2 } : { left: 2 }),
          width: 15,
          height: 15,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 180ms, right 180ms",
        }}
      />
    </button>
  );
}

/* ── Filter ─────────────────────────────────────────────────── */

export function Filter({
  options,
  active,
  onChange,
}: {
  options: string[];
  active: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "var(--pg-sand)",
        borderRadius: "var(--r-sm)",
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 12px",
            borderRadius: "calc(var(--r-sm) + 1px)",
            border: "none",
            cursor: "pointer",
            color: o === active ? "var(--pg-ink)" : "var(--pg-muted)",
            background: o === active ? "var(--pg-card)" : "transparent",
            boxShadow: o === active ? "0 1px 2px rgba(0,0,0,.06)" : "none",
            transition: "background 180ms",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ui.tsx
git commit -m "feat(web): add shared UI atoms (StateBadge, CatTag, RoleChip, Avatar, Switch, Filter)"
```

---

## Task 3: Chrome — `chrome.tsx`

**Files:**
- Create: `packages/web/src/components/chrome.tsx`

- [ ] **Step 1: Create `packages/web/src/components/chrome.tsx`**

```tsx
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
        {user.role === "ADMIN" && (
          <button
            title="Impostazioni"
            onClick={() => navigate("/impostazioni")}
            className={`pg-rail-btn${isActive("/impostazioni") ? " pg-rail-btn--active" : ""}`}
          >
            <Settings size={20} strokeWidth={isActive("/impostazioni") ? 1.9 : 1.6} />
          </button>
        )}
        <button
          title="Esci"
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
        {/* Search affordance (visual only) */}
        <div
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/chrome.tsx
git commit -m "feat(web): add chrome components (Rail, Topbar, PageShell, PageHead)"
```

---

## Task 4: Wire App.tsx + delete NavBar.tsx

**Files:**
- Modify: `packages/web/src/App.tsx`
- Delete: `packages/web/src/components/NavBar.tsx`

- [ ] **Step 1: Replace `packages/web/src/App.tsx`**

```tsx
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
```

- [ ] **Step 2: Delete NavBar.tsx**

```bash
del packages\web\src\components\NavBar.tsx
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

Expected: no errors (NavBar is no longer imported anywhere).

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/NavBar.tsx
git commit -m "feat(web): wire PageShell into App, remove NavBar"
```

---

## Task 5: LoginPage

**Files:**
- Modify: `packages/web/src/pages/LoginPage.tsx`

- [ ] **Step 1: Replace `packages/web/src/pages/LoginPage.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/LoginPage.tsx
git commit -m "feat(web): redesign LoginPage with Pellegrini split layout"
```

---

## Task 6: ReportsPage

**Files:**
- Modify: `packages/web/src/pages/ReportsPage.tsx`

- [ ] **Step 1: Replace `packages/web/src/pages/ReportsPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Plus, ChevronRight } from "lucide-react";
import { api, type ReportSummary } from "../api/client.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";
import { StateBadge } from "../components/ui.js";
import { PageHead } from "../components/chrome.js";

export function ReportsPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const list = await api.get<ReportSummary[]>("/reports");
    setReports(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/reports", { title });
      setTitle("");
      await refresh();
    } catch {
      setError(t("reports.createError"));
    }
  }

  return (
    <>
      <PageHead
        eyebrow={t("reports.title")}
        title="Note"
        accent="spese"
      />

      {/* Create card */}
      <div className="pg-card" style={{ padding: "var(--cardpad)", marginBottom: 24 }}>
        <div
          className="pg-eyebrow"
          style={{ marginBottom: 12 }}
        >
          {t("reports.create")}
        </div>
        <form onSubmit={onCreate} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <label className="pg-field" style={{ flex: 1 }}>
            <span className="pg-label">{t("reports.newTitle")}</span>
            <input
              className="pg-input"
              placeholder={t("reports.newTitle")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="pg-btn pg-btn--gold">
            <Plus size={15} strokeWidth={2} />
            {t("reports.create")}
          </button>
        </form>
        {error && (
          <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="pg-meta">{t("common.loading")}</p>
      ) : reports.length === 0 ? (
        <p className="pg-meta">{t("reports.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden" }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("reports.newTitle")}</th>
                <th>{t("reports.state")}</th>
                <th className="pg-num">{t("reports.total")}</th>
                <th>{t("reports.created")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/note-spese/${r.id}`)}
                >
                  <td style={{ fontWeight: 600, color: "var(--pg-ink)" }}>{r.title}</td>
                  <td><StateBadge state={r.state} /></td>
                  <td className="pg-num">{formatEuroFromCents(r.totalCents)}</td>
                  <td>{formatDateIt(r.createdAt)}</td>
                  <td style={{ width: 32 }}>
                    <ChevronRight size={15} color="var(--pg-muted)" strokeWidth={1.6} />
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/ReportsPage.tsx
git commit -m "feat(web): redesign ReportsPage with Pellegrini brand"
```

---

## Task 7: ReportDetailPage (hero screen)

**Files:**
- Modify: `packages/web/src/pages/ReportDetailPage.tsx`

This is the most complex page. The complete rewrite is below. All existing data-fetching, API calls, and state machine logic are preserved; only markup/styling changes plus replacing `window.prompt` with an inline revise form.

- [ ] **Step 1: Replace `packages/web/src/pages/ReportDetailPage.tsx`**

```tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, X, Send, AlertTriangle } from "lucide-react";
import {
  actionsFor,
  hasAtLeast,
  MONEY_CATEGORIES,
  type MoneyCategory,
  type Category,
} from "@gsa/shared";
import {
  api,
  quoteMileage,
  markPaid,
  type ReportDetail,
  type Vehicle,
  type MileageQuote,
  type MarkPaidInput,
} from "../api/client.js";
import { MarkPaidForm } from "../components/MarkPaidForm.js";
import { useAuth } from "../auth/AuthContext.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";
import { StateBadge, CatTag } from "../components/ui.js";
import { PageHead, useSetDetailTitle } from "../components/chrome.js";

export function ReportDetailPage(): JSX.Element {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Item form state
  const [category, setCategory] = useState<Category>("TRANSPORT");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  // Mileage sub-form state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [roundTrip, setRoundTrip] = useState(false);
  const [estimatedKm, setEstimatedKm] = useState("");
  const [enteredKm, setEnteredKm] = useState("");
  const [justification, setJustification] = useState("");
  const [quote, setQuote] = useState<MileageQuote | null>(null);

  // Action form state
  const [showPayForm, setShowPayForm] = useState(false);
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [reviseComment, setReviseComment] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    if (!id) return;
    setReport(await api.get<ReportDetail>(`/reports/${id}`));
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void api
      .get<Vehicle[]>("/vehicles")
      .then((vs) => setVehicles(vs.filter((v) => v.active)))
      .catch(() => setVehicles([]));
  }, []);

  // Push report title into shell breadcrumb
  useSetDetailTitle(report?.title ?? "");

  if (!report) {
    return <p className="pg-meta" style={{ padding: "2rem" }}>{t("common.loading")}</p>;
  }

  const isOwner = report.ownerId === user?.id;
  const editable =
    report.state === "CREATED" ||
    report.state === "READY_FOR_APPROVAL" ||
    report.state === "IN_REVISION";
  const available = actionsFor(report.state);
  const canManage = available.some(
    (a) => a === "approve" || a === "reject" || a === "revise"
  );
  const isFinance = !!user && hasAtLeast(user.role, "FINANCE");
  const overBound = quote != null && Number(enteredKm) > quote.upperBoundKm;

  // Per-category totals for the totals strip
  const CAT_ORDER: Category[] = ["TRANSPORT", "MILEAGE", "MEALS_LODGING", "OTHER"];
  const byCat = CAT_ORDER.map((cat) => ({
    cat,
    cents: report.items
      .filter((i) => i.category === cat)
      .reduce((s, i) => s + i.amountCents, 0),
  })).filter((g) => g.cents > 0);

  // Revision note from the latest IN_REVISION event
  const revisionEvent = report.events
    .slice()
    .reverse()
    .find((e) => e.toState === "IN_REVISION");

  function resetItemForm(): void {
    setDescription(""); setAmount(""); setDate(""); setVehicleId("");
    setOrigin(""); setDestination(""); setRoundTrip(false);
    setEstimatedKm(""); setEnteredKm(""); setJustification(""); setQuote(null);
  }

  async function onCalculate(): Promise<void> {
    setError(null);
    try {
      const q = await quoteMileage({
        vehicleId, originAddress: origin, destinationAddress: destination,
        roundTrip, manualKm: Math.round(Number(estimatedKm)),
      });
      setQuote(q);
    } catch {
      setError(t("items.mileage.quoteError"));
    }
  }

  async function addItem(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null);
    try {
      if (category === "MILEAGE") {
        await api.post(`/reports/${report.id}/items`, {
          category: "MILEAGE", date, description, vehicleId,
          originAddress: origin, destinationAddress: destination,
          roundTrip, manualKm: Math.round(Number(estimatedKm)),
          enteredKm: Math.round(Number(enteredKm)),
          overageJustification: overBound ? justification.trim() : undefined,
        });
      } else {
        await api.post(`/reports/${report.id}/items`, {
          category, date, description,
          amountCents: Math.round(Number(amount) * 100),
        });
      }
      resetItemForm(); await refresh();
    } catch {
      setError(t("items.addError"));
    }
  }

  async function removeItem(itemId: string): Promise<void> {
    await api.del(`/reports/${report.id}/items/${itemId}`);
    await refresh();
  }

  async function act(
    action: "submit" | "approve" | "reject" | "send-payment"
  ): Promise<void> {
    setError(null);
    try {
      await api.post(`/reports/${report.id}/${action}`);
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  async function submitRevise(): Promise<void> {
    if (!reviseComment.trim()) return;
    setError(null);
    try {
      await api.post(`/reports/${report.id}/revise`, { comment: reviseComment });
      setShowReviseForm(false); setReviseComment("");
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  async function payNow(input: MarkPaidInput): Promise<void> {
    setError(null);
    try {
      await markPaid(report.id, input);
      setShowPayForm(false); await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  const allCategories: Category[] = ["MILEAGE", ...MONEY_CATEGORIES];

  return (
    <>
      {/* Back link */}
      <button
        className="pg-btn pg-btn--quiet"
        style={{ marginBottom: 18, padding: "6px 12px", fontSize: 12 }}
        onClick={() => navigate("/note-spese")}
      >
        <ArrowLeft size={14} strokeWidth={1.6} />
        {t("reports.back")}
      </button>

      {/* Hero header */}
      <PageHead
        eyebrow={t("reports.state")}
        title={report.title}
        right={<StateBadge state={report.state} />}
      />

      {/* Big total */}
      <div style={{ marginBottom: 24 }}>
        <div className="pg-eyebrow" style={{ marginBottom: 6 }}>{t("reports.total")}</div>
        <div
          style={{
            fontFamily: "var(--serif)",
            fontWeight: 500,
            fontSize: 38,
            color: "var(--pg-ink)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatEuroFromCents(report.totalCents)}
        </div>
      </div>

      {/* IN_REVISION banner */}
      {report.state === "IN_REVISION" && revisionEvent && (
        <div
          style={{
            background: "var(--pg-blue-bg)",
            border: "1px solid var(--pg-blue)",
            borderRadius: "var(--r)",
            padding: "14px 18px",
            marginBottom: 24,
            display: "flex",
            gap: 12,
          }}
        >
          <AlertTriangle
            size={17}
            color="var(--pg-blue)"
            strokeWidth={1.6}
            style={{ flexShrink: 0, marginTop: 1 }}
          />
          <div>
            <div style={{ fontWeight: 600, color: "var(--pg-blue)", marginBottom: 4 }}>
              Revisione richiesta
            </div>
            <div style={{ fontSize: 13, color: "var(--pg-body)" }}>
              {revisionEvent.comment}
            </div>
            <div className="pg-meta" style={{ marginTop: 4 }}>
              {formatDateIt(revisionEvent.createdAt)}
            </div>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginBottom: 16 }}>
          {error}
        </p>
      )}

      {/* Items table */}
      <div style={{ marginBottom: 8 }}>
        <div className="pg-eyebrow" style={{ marginBottom: 14 }}>{t("items.heading")}</div>
      </div>

      {report.items.length === 0 ? (
        <p className="pg-meta">{t("items.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden", marginBottom: 0 }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("items.date")}</th>
                <th>{t("items.category")}</th>
                <th>{t("items.description")}</th>
                <th className="pg-num">{t("items.amount")}</th>
                {isOwner && editable && <th />}
              </tr>
            </thead>
            <tbody>
              {report.items.map((it) => (
                <tr key={it.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateIt(it.date)}</td>
                  <td><CatTag cat={it.category} /></td>
                  <td>
                    <div>{it.description}</div>
                    {it.category === "MILEAGE" && it.originAddress && (
                      <div className="pg-meta" style={{ marginTop: 2 }}>
                        {it.originAddress} → {it.destinationAddress}
                        {it.roundTrip && " (A/R)"}
                        {it.enteredKm != null && ` · ${it.enteredKm} km`}
                        {it.ratePerKm && ` · ${it.ratePerKm} €/km`}
                      </div>
                    )}
                    {it.overageJustification && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11.5,
                          color: "var(--pg-amber)",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <AlertTriangle size={12} strokeWidth={1.6} />
                        {it.overageJustification}
                      </div>
                    )}
                  </td>
                  <td className="pg-num">{formatEuroFromCents(it.amountCents)}</td>
                  {isOwner && editable && (
                    <td>
                      <button
                        className="pg-btn pg-btn--danger"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => void removeItem(it.id)}
                      >
                        <X size={13} strokeWidth={1.6} />
                        {t("items.remove")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals strip */}
          <div
            style={{
              borderTop: "2px solid var(--pg-gold-line)",
              padding: "14px var(--cardpad)",
              display: "flex",
              alignItems: "center",
              gap: 24,
              flexWrap: "wrap",
              background: "var(--pg-card)",
            }}
          >
            {byCat.map(({ cat, cents }) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CatTag cat={cat} />
                <span className="pg-num" style={{ fontSize: 13 }}>
                  {formatEuroFromCents(cents)}
                </span>
              </div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 600, color: "var(--pg-muted)", fontSize: 12 }}>
                {t("reports.total")}
              </span>
              <span
                className="pg-num"
                style={{
                  fontSize: 18,
                  fontFamily: "var(--serif)",
                  fontWeight: 500,
                  color: "var(--pg-ink)",
                }}
              >
                {formatEuroFromCents(report.totalCents)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Add-item form */}
      {isOwner && editable && (
        <div className="pg-card" style={{ padding: "var(--cardpad)", marginTop: 20 }}>
          <div className="pg-eyebrow" style={{ marginBottom: 14 }}>{t("items.add")}</div>
          <form
            onSubmit={addItem}
            style={{ display: "grid", gap: 12, maxWidth: 520 }}
          >
            <label className="pg-field">
              <span className="pg-label">{t("items.category")}</span>
              <select
                className="pg-select"
                value={category}
                onChange={(e) => { setCategory(e.target.value as Category); setQuote(null); }}
              >
                {allCategories.map((c) => (
                  <option key={c} value={c}>{t(`categories.${c}`)}</option>
                ))}
              </select>
            </label>

            <label className="pg-field">
              <span className="pg-label">{t("items.date")}</span>
              <input
                className="pg-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>

            <label className="pg-field">
              <span className="pg-label">{t("items.description")}</span>
              <input
                className="pg-input"
                placeholder={t("items.description")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            {category === "MILEAGE" ? (
              vehicles.length === 0 ? (
                <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13 }}>
                  {t("items.mileage.needVehicle")}
                </p>
              ) : (
                <>
                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.vehicle")}</span>
                    <select
                      className="pg-select"
                      value={vehicleId}
                      onChange={(e) => { setVehicleId(e.target.value); setQuote(null); }}
                      required
                    >
                      <option value="">{t("items.mileage.noVehicle")}</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} — {v.aciRate.make} {v.aciRate.model} ({v.aciRate.costPerKm} €/km)
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.origin")}</span>
                    <input
                      className="pg-input"
                      placeholder={t("items.mileage.origin")}
                      value={origin}
                      onChange={(e) => { setOrigin(e.target.value); setQuote(null); }}
                      required
                    />
                  </label>

                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.destination")}</span>
                    <input
                      className="pg-input"
                      placeholder={t("items.mileage.destination")}
                      value={destination}
                      onChange={(e) => { setDestination(e.target.value); setQuote(null); }}
                      required
                    />
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={roundTrip}
                      onChange={(e) => { setRoundTrip(e.target.checked); setQuote(null); }}
                    />
                    <span style={{ fontSize: 13, color: "var(--pg-body)" }}>
                      {t("items.mileage.roundTrip")}
                    </span>
                  </label>

                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.estimatedKm")}</span>
                    <input
                      className="pg-input"
                      type="number" min="1" step="1"
                      value={estimatedKm}
                      onChange={(e) => { setEstimatedKm(e.target.value); setQuote(null); }}
                      required
                    />
                  </label>

                  <button
                    type="button"
                    className="pg-btn pg-btn--ghost"
                    onClick={() => void onCalculate()}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {t("items.mileage.calculate")}
                  </button>

                  {quote && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "var(--pg-green-bg)",
                        color: "var(--pg-green)",
                        borderRadius: 999,
                        padding: "5px 12px",
                        fontSize: 12.5,
                        fontWeight: 600,
                        alignSelf: "flex-start",
                      }}
                    >
                      <Check size={13} strokeWidth={2} />
                      {t("items.mileage.range")}: {quote.baselineKm}–{quote.upperBoundKm} km
                      {" · "}{t("items.mileage.ratePerKm")}: {quote.ratePerKm} €/km
                    </div>
                  )}

                  <label className="pg-field">
                    <span className="pg-label">{t("items.mileage.enteredKm")}</span>
                    <input
                      className="pg-input"
                      type="number" min="1" step="1"
                      value={enteredKm}
                      onChange={(e) => setEnteredKm(e.target.value)}
                      disabled={!quote}
                      required
                    />
                  </label>

                  {overBound && (
                    <label className="pg-field">
                      <span className="pg-label" style={{ color: "var(--pg-amber)" }}>
                        {t("items.mileage.justification")}
                      </span>
                      <textarea
                        className="pg-textarea"
                        rows={3}
                        placeholder={t("items.mileage.justification")}
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        required
                      />
                    </label>
                  )}

                  <button
                    type="submit"
                    className="pg-btn pg-btn--gold"
                    disabled={!quote || (overBound && justification.trim() === "")}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {t("items.add")}
                  </button>
                </>
              )
            ) : (
              <>
                <label className="pg-field">
                  <span className="pg-label">{t("items.amount")}</span>
                  <input
                    className="pg-input"
                    type="number" step="0.01" min="0"
                    placeholder={t("items.amount")}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="pg-btn pg-btn--gold"
                  style={{ alignSelf: "flex-start" }}
                >
                  {t("items.add")}
                </button>
              </>
            )}
          </form>
        </div>
      )}

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 28,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        {isOwner && available.includes("submit") && (
          <button className="pg-btn pg-btn--primary" onClick={() => void act("submit")}>
            <Send size={14} strokeWidth={1.6} />
            {t("reports.submit")}
          </button>
        )}
        {canManage && (
          <>
            <button
              className="pg-btn pg-btn--ghost"
              onClick={() => { setShowReviseForm((v) => !v); setReviseComment(""); }}
            >
              {t("reports.revise")}
            </button>
            <button
              className="pg-btn pg-btn--danger"
              onClick={() => void act("reject")}
            >
              <X size={14} strokeWidth={1.6} />
              {t("reports.reject")}
            </button>
            <button
              className="pg-btn pg-btn--gold"
              onClick={() => void act("approve")}
            >
              <Check size={14} strokeWidth={1.6} />
              {t("reports.approve")}
            </button>
          </>
        )}
        {isFinance && available.includes("send-payment") && (
          <button className="pg-btn pg-btn--primary" onClick={() => void act("send-payment")}>
            {t("reports.sendPayment")}
          </button>
        )}
        {isFinance && available.includes("mark-paid") && !showPayForm && (
          <button className="pg-btn pg-btn--gold" onClick={() => setShowPayForm(true)}>
            {t("reports.markPaid")}
          </button>
        )}
        {isFinance && available.includes("mark-paid") && showPayForm && (
          <MarkPaidForm onSubmit={(input) => void payNow(input)} />
        )}
      </div>

      {/* Inline revise form */}
      {showReviseForm && (
        <div className="pg-card" style={{ padding: "var(--cardpad)", marginTop: 16, maxWidth: 520 }}>
          <div className="pg-eyebrow" style={{ marginBottom: 10 }}>
            {t("reports.revise")}
          </div>
          <label className="pg-field" style={{ marginBottom: 12 }}>
            <span className="pg-label">{t("reports.revisePrompt")}</span>
            <textarea
              className="pg-textarea"
              rows={3}
              value={reviseComment}
              onChange={(e) => setReviseComment(e.target.value)}
              required
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="pg-btn pg-btn--primary"
              disabled={!reviseComment.trim()}
              onClick={() => void submitRevise()}
            >
              {t("reports.revise")}
            </button>
            <button
              className="pg-btn pg-btn--ghost"
              onClick={() => { setShowReviseForm(false); setReviseComment(""); }}
            >
              {t("users.cancel")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/ReportDetailPage.tsx
git commit -m "feat(web): redesign ReportDetailPage (hero screen) with inline revise form"
```

---

## Task 8: ApprovalsPage

**Files:**
- Modify: `packages/web/src/pages/ApprovalsPage.tsx`

Note: adds inline approve/reject/revise actions and a `/users` fetch to resolve owner names — both use existing API endpoints and i18n keys.

- [ ] **Step 1: Replace `packages/web/src/pages/ApprovalsPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Check, X, ChevronRight } from "lucide-react";
import { actionsFor } from "@gsa/shared";
import { api, type ReportSummary } from "../api/client.js";
import { formatEuroFromCents, formatDateIt } from "../format.js";
import { StateBadge, Avatar, Filter } from "../components/ui.js";
import { PageHead } from "../components/chrome.js";

interface UserSummary { id: string; fullName: string }

const FILTER_ALL = "Tutte";

export function ApprovalsPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(FILTER_ALL);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [reviseComment, setReviseComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const list = await api.get<ReportSummary[]>("/reports?scope=approvals");
    setReports(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    void api.get<UserSummary[]>("/users").then(setUsers).catch(() => {});
  }, []);

  const filterOptions = [
    FILTER_ALL,
    t("states.READY_FOR_APPROVAL"),
    t("states.IN_REVISION"),
  ];

  const visible = filter === FILTER_ALL
    ? reports
    : reports.filter((r) => t(`states.${r.state}`) === filter);

  function ownerName(ownerId: string): string {
    return users.find((u) => u.id === ownerId)?.fullName ?? "—";
  }

  async function quickAct(
    id: string,
    action: "approve" | "reject"
  ): Promise<void> {
    setError(null);
    try {
      await api.post(`/reports/${id}/${action}`);
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  async function submitRevise(id: string): Promise<void> {
    if (!reviseComment.trim()) return;
    setError(null);
    try {
      await api.post(`/reports/${id}/revise`, { comment: reviseComment });
      setRevisingId(null); setReviseComment("");
      await refresh();
    } catch {
      setError(t("reports.actionError"));
    }
  }

  return (
    <>
      <PageHead
        eyebrow={t("reports.approvalsTitle")}
        title="Note spese"
        accent="da approvare"
        sub={`${reports.length} in attesa`}
        right={
          <Filter
            options={filterOptions}
            active={filter}
            onChange={setFilter}
          />
        }
      />

      {error && (
        <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="pg-meta">{t("common.loading")}</p>
      ) : visible.length === 0 ? (
        <p className="pg-meta">{t("reports.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visible.map((r) => {
            const available = actionsFor(r.state);
            const canAct = available.some(
              (a) => a === "approve" || a === "reject" || a === "revise"
            );
            const name = ownerName(r.ownerId);

            return (
              <div
                key={r.id}
                className="pg-card"
                style={{
                  padding: "var(--cardpad)",
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                }}
              >
                {/* Avatar */}
                <Avatar name={name} size={40} />

                {/* Title + meta */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span
                      style={{
                        color: "var(--pg-ink)",
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                      onClick={() => navigate(`/note-spese/${r.id}`)}
                    >
                      {r.title}
                    </span>
                    <StateBadge state={r.state} />
                  </div>
                  <div className="pg-meta" style={{ marginTop: 3 }}>
                    {name}
                    {r.submittedAt && ` · inviata ${formatDateIt(r.submittedAt)}`}
                  </div>
                </div>

                {/* Total */}
                <div style={{ textAlign: "right", marginRight: 6, flexShrink: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--serif)",
                      fontWeight: 500,
                      fontSize: 20,
                      color: "var(--pg-ink)",
                    }}
                  >
                    {formatEuroFromCents(r.totalCents)}
                  </div>
                </div>

                {/* Actions */}
                {canAct && (
                  <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                    <button
                      className="pg-btn pg-btn--ghost"
                      style={{ padding: "7px 12px" }}
                      onClick={() => {
                        setRevisingId(revisingId === r.id ? null : r.id);
                        setReviseComment("");
                      }}
                    >
                      {t("reports.revise")}
                    </button>
                    <button
                      className="pg-btn pg-btn--danger"
                      style={{ padding: "7px 12px" }}
                      onClick={() => void quickAct(r.id, "reject")}
                    >
                      <X size={14} strokeWidth={1.6} />
                      {t("reports.reject")}
                    </button>
                    <button
                      className="pg-btn pg-btn--primary"
                      style={{ padding: "7px 14px" }}
                      onClick={() => void quickAct(r.id, "approve")}
                    >
                      <Check size={14} strokeWidth={1.6} />
                      {t("reports.approve")}
                    </button>
                    <button
                      title={t("reports.open")}
                      className="pg-btn pg-btn--quiet"
                      style={{ padding: "7px 10px" }}
                      onClick={() => navigate(`/note-spese/${r.id}`)}
                    >
                      <ChevronRight size={15} strokeWidth={1.6} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline revise forms — rendered below the card list */}
      {revisingId && (
        <div
          className="pg-card"
          style={{ padding: "var(--cardpad)", marginTop: 16, maxWidth: 520 }}
        >
          <div className="pg-eyebrow" style={{ marginBottom: 10 }}>{t("reports.revise")}</div>
          <label className="pg-field" style={{ marginBottom: 12 }}>
            <span className="pg-label">{t("reports.revisePrompt")}</span>
            <textarea
              className="pg-textarea"
              rows={3}
              value={reviseComment}
              onChange={(e) => setReviseComment(e.target.value)}
              required
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="pg-btn pg-btn--primary"
              disabled={!reviseComment.trim()}
              onClick={() => void submitRevise(revisingId)}
            >
              {t("reports.revise")}
            </button>
            <button
              className="pg-btn pg-btn--ghost"
              onClick={() => { setRevisingId(null); setReviseComment(""); }}
            >
              {t("users.cancel")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/ApprovalsPage.tsx
git commit -m "feat(web): redesign ApprovalsPage with cards and inline actions"
```

---

## Task 9: PagamentiPage + MarkPaidForm

**Files:**
- Modify: `packages/web/src/pages/PagamentiPage.tsx`
- Modify: `packages/web/src/components/MarkPaidForm.tsx`

- [ ] **Step 1: Replace `packages/web/src/components/MarkPaidForm.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import type { MarkPaidInput } from "../api/client.js";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MarkPaidForm({
  onSubmit,
}: {
  onSubmit: (input: MarkPaidInput) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState("");

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    onSubmit({ paidAt, paymentReference: reference.trim() || undefined });
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}
    >
      <label className="pg-field">
        <span className="pg-label">{t("payments.paidAt")}</span>
        <input
          className="pg-input"
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          required
          style={{ width: 150 }}
        />
      </label>
      <label className="pg-field">
        <span className="pg-label">{t("payments.reference")}</span>
        <input
          className="pg-input"
          placeholder={t("payments.reference")}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          style={{ width: 200 }}
        />
      </label>
      <button type="submit" className="pg-btn pg-btn--gold">
        <Check size={14} strokeWidth={2} />
        {t("payments.confirmPaid")}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Replace `packages/web/src/pages/PagamentiPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Download, Check } from "lucide-react";
import {
  api,
  sendPayment,
  markPaid,
  exportCsvUrl,
  type ReportSummary,
  type ReportState,
  type MarkPaidInput,
} from "../api/client.js";
import { formatEuroFromCents } from "../format.js";
import { MarkPaidForm } from "../components/MarkPaidForm.js";
import { StateBadge, Filter } from "../components/ui.js";
import { PageHead } from "../components/chrome.js";

const PAYABLE_STATES: ReportState[] = ["APPROVED", "SENT_FOR_PAYMENT", "PAID"];
const FILTER_ALL = "Tutti";

export function PagamentiPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [filter, setFilter] = useState(FILTER_ALL);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setReports(await api.get<ReportSummary[]>("/reports?scope=payments"));
  }

  useEffect(() => {
    void refresh().catch(() => setError(t("payments.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filterOptions = [
    FILTER_ALL,
    ...PAYABLE_STATES.map((s) => t(`states.${s}`)),
  ];

  const visible =
    filter === FILTER_ALL
      ? reports
      : reports.filter((r) => t(`states.${r.state}`) === filter);

  async function onSend(id: string): Promise<void> {
    setError(null);
    try { await sendPayment(id); await refresh(); }
    catch { setError(t("payments.actionError")); }
  }

  async function onPaid(id: string, input: MarkPaidInput): Promise<void> {
    setError(null);
    try { await markPaid(id, input); setPayingId(null); await refresh(); }
    catch { setError(t("payments.actionError")); }
  }

  return (
    <>
      <PageHead
        eyebrow={t("payments.title")}
        title="Gestione"
        accent="pagamenti"
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <a
              href={exportCsvUrl("reports")}
              download
              className="pg-btn pg-btn--ghost"
              style={{ textDecoration: "none", fontSize: 12 }}
            >
              <Download size={14} strokeWidth={1.6} />
              {t("payments.exportReports")}
            </a>
            <a
              href={exportCsvUrl("items")}
              download
              className="pg-btn pg-btn--ghost"
              style={{ textDecoration: "none", fontSize: 12 }}
            >
              <Download size={14} strokeWidth={1.6} />
              {t("payments.exportItems")}
            </a>
          </div>
        }
      />

      <div style={{ marginBottom: 18 }}>
        <Filter options={filterOptions} active={filter} onChange={setFilter} />
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="pg-meta">{t("payments.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden" }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("payments.reportTitle")}</th>
                <th>{t("payments.state")}</th>
                <th className="pg-num">{t("payments.total")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "var(--pg-ink)",
                        cursor: "pointer",
                      }}
                      onClick={() => navigate(`/note-spese/${r.id}`)}
                    >
                      {r.title}
                    </span>
                  </td>
                  <td><StateBadge state={r.state} /></td>
                  <td className="pg-num">{formatEuroFromCents(r.totalCents)}</td>
                  <td>
                    {r.state === "APPROVED" && (
                      <button
                        className="pg-btn pg-btn--primary"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        onClick={() => void onSend(r.id)}
                      >
                        {t("payments.send")}
                      </button>
                    )}
                    {r.state === "SENT_FOR_PAYMENT" &&
                      (payingId === r.id ? (
                        <MarkPaidForm onSubmit={(input) => void onPaid(r.id, input)} />
                      ) : (
                        <button
                          className="pg-btn pg-btn--gold"
                          style={{ padding: "6px 12px", fontSize: 12 }}
                          onClick={() => setPayingId(r.id)}
                        >
                          {t("payments.markPaid")}
                        </button>
                      ))}
                    {r.state === "PAID" && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          color: "var(--pg-green)",
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}
                      >
                        <Check size={13} strokeWidth={2} />
                        {r.decidedAt ? new Date(r.decidedAt).toLocaleDateString("it-IT") : t("states.PAID")}
                      </span>
                    )}
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
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/PagamentiPage.tsx packages/web/src/components/MarkPaidForm.tsx
git commit -m "feat(web): redesign PagamentiPage and MarkPaidForm"
```

---

## Task 10: VehiclesPage

**Files:**
- Modify: `packages/web/src/pages/VehiclesPage.tsx`

- [ ] **Step 1: Replace `packages/web/src/pages/VehiclesPage.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/VehiclesPage.tsx
git commit -m "feat(web): redesign VehiclesPage"
```

---

## Task 11: AciRatesPage

**Files:**
- Modify: `packages/web/src/pages/AciRatesPage.tsx`

- [ ] **Step 1: Replace `packages/web/src/pages/AciRatesPage.tsx`**

```tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";
import { api, type AciRate, type AciImportBatch, type ApiError } from "../api/client.js";
import { formatDateIt } from "../format.js";
import { PageHead } from "../components/chrome.js";

interface ImportRowError { row: number; messages: string[] }

// Fuel pill colors
const FUEL_COLOR: Record<string, string> = {
  Benzina:   "#2c5d86",
  Gasolio:   "#4d5a3a",
  Ibrido:    "#2f7d52",
  Elettrico: "#1a6b6b",
  GPL:       "#8a5c2e",
  Metano:    "#5a3d7a",
};

export function AciRatesPage(): JSX.Element {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [batch, setBatch] = useState<AciImportBatch | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rates, setRates] = useState<AciRate[]>([]);

  async function refreshRates(term = ""): Promise<void> {
    setRates(await api.get<AciRate[]>(`/aci/rates?search=${encodeURIComponent(term)}`));
  }

  useEffect(() => { void refreshRates(); }, []);

  async function onImport(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setRowErrors([]); setBatch(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const result = await api.upload<AciImportBatch>("/aci/import", fd);
      setBatch(result); await refreshRates(search);
    } catch (err) {
      const righe = (err as ApiError).body?.righe;
      setError(t("aci.importError"));
      if (Array.isArray(righe)) setRowErrors(righe as ImportRowError[]);
    }
  }

  async function onSearch(e: FormEvent): Promise<void> {
    e.preventDefault(); await refreshRates(search);
  }

  return (
    <>
      <PageHead
        eyebrow={t("aci.title")}
        title="Tabelle"
        accent="ACI"
      />

      {/* Import card */}
      <div className="pg-card" style={{ padding: "var(--cardpad)", marginBottom: 20 }}>
        <div className="pg-eyebrow" style={{ marginBottom: 14 }}>{t("aci.import")}</div>
        <form onSubmit={onImport} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="pg-field">
            <span className="pg-label">{t("aci.file")}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              required
              style={{
                fontSize: 13,
                color: "var(--pg-body)",
                padding: "7px 0",
              }}
            />
          </label>
          <button type="submit" className="pg-btn pg-btn--primary">
            {t("aci.import")}
          </button>
        </form>
        <p className="pg-mono" style={{ marginTop: 10, color: "var(--pg-muted)" }}>
          {t("aci.help")}
        </p>

        {error && (
          <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginTop: 8 }}>
            {error}
          </p>
        )}

        {rowErrors.length > 0 && (
          <ul style={{ fontSize: 12.5, color: "var(--pg-danger)", marginTop: 8 }}>
            {rowErrors.map((re) => (
              <li key={re.row}>
                {t("aci.row")} {re.row}: {re.messages.join(" ")}
              </li>
            ))}
          </ul>
        )}

        {batch && (
          <div
            style={{
              marginTop: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "var(--pg-green-bg)",
              color: "var(--pg-green)",
              borderRadius: 999,
              padding: "5px 14px",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <Check size={13} strokeWidth={2} />
            {t("aci.imported")}: {t("aci.batchYear")} {batch.year}
            {" · "}{t("aci.batchRows")} {batch.rowCount}
            {" · "}{t("aci.batchAt")} {formatDateIt(batch.importedAt)}
          </div>
        )}
      </div>

      {/* Search */}
      <form onSubmit={onSearch} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <label className="pg-field" style={{ flex: 1, maxWidth: 400 }}>
          <span className="pg-label">{t("aci.search")}</span>
          <input
            className="pg-input"
            placeholder={t("aci.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button type="submit" className="pg-btn pg-btn--ghost" style={{ alignSelf: "flex-end" }}>
          <Search size={14} strokeWidth={1.6} />
          {t("aci.search")}
        </button>
      </form>

      {/* Rates table */}
      {rates.length === 0 ? (
        <p className="pg-meta">{t("aci.empty")}</p>
      ) : (
        <div className="pg-card" style={{ overflow: "hidden" }}>
          <table className="pg-table">
            <thead>
              <tr>
                <th>{t("aci.colYear")}</th>
                <th>{t("aci.colMake")}</th>
                <th>{t("aci.colModel")}</th>
                <th>{t("aci.colFuel")}</th>
                <th>{t("aci.colVariant")}</th>
                <th className="pg-num">{t("aci.colCost")}</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => {
                const fuelColor = FUEL_COLOR[r.fuel] ?? "var(--pg-slate)";
                return (
                  <tr key={r.id}>
                    <td>{r.year}</td>
                    <td style={{ fontWeight: 600, color: "var(--pg-ink)" }}>{r.make}</td>
                    <td>{r.model}</td>
                    <td>
                      <span
                        className="pg-badge"
                        style={{
                          color: fuelColor,
                          background: fuelColor + "22",
                          fontSize: 11,
                        }}
                      >
                        <span className="dot" />
                        {r.fuel}
                      </span>
                    </td>
                    <td className="pg-meta">{r.variant}</td>
                    <td className="pg-num">{r.costPerKm}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/AciRatesPage.tsx
git commit -m "feat(web): redesign AciRatesPage"
```

---

## Task 12: SettingsPage

**Files:**
- Modify: `packages/web/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Replace `packages/web/src/pages/SettingsPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type ToleranceSetting } from "../api/client.js";
import { PageHead } from "../components/chrome.js";

export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const [tolerance, setTolerance] = useState("10");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<ToleranceSetting>("/settings/mileage-tolerance")
      .then((s) => setTolerance(String(s.tolerancePercent)))
      .catch(() => setError(t("settings.loadError")));
  }, []);

  async function onSave(e: FormEvent): Promise<void> {
    e.preventDefault(); setError(null); setSaved(false);
    try {
      const result = await api.put<ToleranceSetting>("/settings/mileage-tolerance", {
        tolerancePercent: Number(tolerance),
      });
      setTolerance(String(result.tolerancePercent));
      setSaved(true);
    } catch {
      setError(t("settings.saveError"));
    }
  }

  const pct = Math.max(0, Math.min(100, Number(tolerance) || 0));

  return (
    <>
      <PageHead
        eyebrow={t("settings.title")}
        title="Impostazioni"
        accent="aziendali"
      />

      <div className="pg-card" style={{ padding: "var(--cardpad)", maxWidth: 480 }}>
        <form onSubmit={onSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <label className="pg-field">
            <span className="pg-label">{t("settings.tolerance")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                className="pg-input"
                type="number"
                min="0"
                max="100"
                step="1"
                value={tolerance}
                onChange={(e) => { setTolerance(e.target.value); setSaved(false); }}
                style={{ width: 90 }}
              />
              <span style={{ color: "var(--pg-muted)", fontSize: 13 }}>%</span>
            </div>
          </label>

          {/* Visual range bar */}
          <div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: "var(--pg-sand)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "var(--pg-gold)",
                  borderRadius: 999,
                  transition: "width 200ms",
                }}
              />
            </div>
            <div
              className="pg-meta"
              style={{ marginTop: 5, textAlign: "right" }}
            >
              {pct}%
            </div>
          </div>

          <button
            type="submit"
            className="pg-btn pg-btn--primary"
            style={{ alignSelf: "flex-start" }}
          >
            {t("settings.save")}
          </button>
        </form>

        {saved && (
          <p style={{ color: "var(--pg-green)", fontSize: 13, marginTop: 12 }}>
            {t("settings.saved")}
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--pg-danger)", fontSize: 13, marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/SettingsPage.tsx
git commit -m "feat(web): redesign SettingsPage"
```

---

## Task 13: UsersPage

**Files:**
- Modify: `packages/web/src/pages/UsersPage.tsx`

- [ ] **Step 1: Replace `packages/web/src/pages/UsersPage.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/web && npx tsc --noEmit --skipLibCheck
```

- [ ] **Step 3: Final full build check**

```bash
cd packages/web && npm run build
```

Expected: builds successfully with no TypeScript errors and no Vite errors.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/UsersPage.tsx
git commit -m "feat(web): redesign UsersPage"
```

---

## Self-review notes

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| pellegrini.css + compact/sharp defaults | Task 1 |
| Assets (logo, emblem) | Task 1 |
| lucide-react | Task 1 |
| StateBadge, CatTag, RoleChip, Avatar, Switch, Filter | Task 2 |
| Rail (role gates, active state, logout) | Task 3 |
| Topbar (logo, breadcrumb, user, search affordance) | Task 3 |
| PageShell (full-height layout, scroll container) | Task 3 |
| PageHead (eyebrow, serif title, accent, right slot) | Task 3 |
| DetailTitleCtx + useSetDetailTitle hook | Task 3 |
| App.tsx wiring, NavBar deletion | Task 4 |
| LoginPage split layout | Task 5 |
| ReportsPage table + create card | Task 6 |
| ReportDetailPage hero, IN_REVISION banner, totals strip, mileage sub-row, add-item form, inline revise form, action bar | Task 7 |
| ApprovalsPage cards + Filter + inline approve/reject/revise | Task 8 |
| PagamentiPage table + Filter + per-row actions + CSV links | Task 9 |
| MarkPaidForm restyle | Task 9 |
| VehiclesPage add card + table + Switch | Task 10 |
| AciRatesPage import card + fuel pills + table | Task 11 |
| SettingsPage single card + gold range bar | Task 12 |
| UsersPage create card + table + RoleChip + Switch | Task 13 |

All spec requirements are covered. No placeholders remain. Type names are consistent throughout (`ReportState`, `Category`, `Role`, `ReportSummary`, `ReportDetail` — all imported from `../api/client.js`). The `useSetDetailTitle` hook is defined in `chrome.tsx` and imported in `ReportDetailPage`.
