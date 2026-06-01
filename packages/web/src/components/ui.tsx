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
