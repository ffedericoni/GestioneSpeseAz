# Design spec: Pellegrini redesign — Gestione Spese Aziendali

**Date:** 2026-06-02  
**Scope:** `packages/web` — full visual redesign using Gruppo Pellegrini brand  
**Approach:** Option A — atoms first, then screens  
**Fidelity:** High (pixel-for-pixel per `design_handoff_pellegrini/README.md`)

---

## 1. Goals

Replace every bare `inline style + system-ui` in the React 18/Vite/TS web package with a token-driven stylesheet and a small shared component layer. No changes to routes, data-fetching, API calls, i18n keys, or the `@gsa/shared` state machine. The one behavioural exception: replace `window.prompt` on the "Richiedi revisione" action with an inline textarea form.

---

## 2. Infrastructure

### 2.1 CSS tokens
- Copy `design_handoff_pellegrini/pellegrini.css` → `packages/web/src/pellegrini.css`
- Import once in `packages/web/src/main.tsx`:
  ```ts
  import "./pellegrini.css";
  ```
- Ship with compact + sharp defaults (no UI controls for density/radius):
  ```css
  :root { --rowpad-y: 7px; --cardpad: 18px; --ui-fs: 13px; }   /* compact */
  :root { --r: 3px; --r-sm: 2px; }                              /* sharp */
  ```
  These are already the defaults in `pellegrini.css`; no overrides needed.

### 2.2 Assets
- Copy `design_handoff_pellegrini/assets/pg-logo.png` → `packages/web/public/pg-logo.png`
- Copy `design_handoff_pellegrini/assets/pg-emblem.png` → `packages/web/public/pg-emblem.png`
- Referenced as `/pg-logo.png` / `/pg-emblem.png` (no import, public-served).

### 2.3 Dependencies
- Add `lucide-react` to `dependencies` in `packages/web/package.json`
- All icons use `strokeWidth={1.6}` per handoff spec
- Icon names used: `Receipt, Car, CheckCircle2, Wallet, Table2, Users, Settings, LogOut, Search, Plus, ArrowLeft, ChevronRight, Check, X, Clock, MapPin, Paperclip, Download, Repeat, Send, AlertTriangle, Route, Building2, FileText`

---

## 3. Shared atoms — `packages/web/src/components/ui.tsx`

Single file exporting all stateless atoms. Uses `pellegrini.css` classes + per-instance inline color from the data maps.

### 3.1 `StateBadge`
```ts
interface StateBadgeProps { state: ExpenseState }
```
- Renders `.pg-badge` pill with leading `.dot`
- Color from `STATE_STYLE` map (fg/bg CSS variables):
  ```ts
  const STATE_STYLE = {
    CREATED:            { fg: 'var(--pg-slate)',  bg: 'var(--pg-slate-bg)'   },
    READY_FOR_APPROVAL: { fg: 'var(--pg-amber)',  bg: 'var(--pg-amber-bg)'   },
    IN_REVISION:        { fg: 'var(--pg-blue)',   bg: 'var(--pg-blue-bg)'    },
    APPROVED:           { fg: 'var(--pg-green)',  bg: 'var(--pg-green-bg)'   },
    REJECTED:           { fg: 'var(--pg-danger)', bg: 'var(--pg-danger-tint)'},
    SENT_FOR_PAYMENT:   { fg: 'var(--pg-blue)',   bg: 'var(--pg-blue-bg)'    },
    PAID:               { fg: 'var(--pg-green)',  bg: 'var(--pg-green-bg)'   },
  };
  ```
- Label from `t('states.<STATE>')` (existing i18n keys)

### 3.2 `CatTag`
```ts
interface CatTagProps { cat: Category; withIcon?: boolean }
```
- Renders `.pg-cat` with either a colored `.swatch` or a Lucide icon
- Color/icon from `CAT` map:
  ```ts
  const CAT = {
    MILEAGE:       { color: '#2c5d86', icon: Route,     key: 'categories.MILEAGE'       },
    MEALS_LODGING: { color: '#a9711a', icon: Building2, key: 'categories.MEALS_LODGING' },
    TRANSPORT:     { color: '#2f7d52', icon: Send,      key: 'categories.TRANSPORT'     },
    OTHER:         { color: '#6b6259', icon: FileText,  key: 'categories.OTHER'         },
  };
  ```
- Label from `t(CAT[cat].key)`

### 3.3 `RoleChip`
```ts
interface RoleChipProps { role: Role }
```
- Small inline chip
- Colors from `ROLE_CHIP` map:
  ```ts
  const ROLE_CHIP = {
    ADMIN:    { fg: 'var(--pg-gold-deep)', bg: 'var(--pg-gold-tint)' },
    MANAGER:  { fg: 'var(--pg-blue)',      bg: 'var(--pg-blue-bg)'   },
    FINANCE:  { fg: 'var(--pg-green)',     bg: 'var(--pg-green-bg)'  },
    EMPLOYEE: { fg: 'var(--pg-slate)',     bg: 'var(--pg-sand)'      },
  };
  ```
- Label from `t('roles.<ROLE>')`

### 3.4 `Avatar`
```ts
interface AvatarProps { name: string; size?: number }
```
- Squircle (radius 9), `--pg-sand-2` background
- Serif initials: first letter of each word, max 2
- Default size 32px

### 3.5 `Switch`
```ts
interface SwitchProps { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }
```
- Controlled visual toggle
- On: `--pg-gold-deep` track, knob right
- Off: `--pg-sand-2` track, knob left
- Transition 180ms

### 3.6 `Filter`
```ts
interface FilterProps { options: string[]; active: string; onChange: (v: string) => void }
```
- Segmented chip bar in `--pg-sand` pill container
- Active chip: `--pg-card` background + shadow; inactive: transparent

---

## 4. Chrome — `packages/web/src/components/chrome.tsx`

Exports `Rail`, `Topbar`, `PageShell`, `PageHead`.

### 4.1 `Rail`
```ts
interface RailProps { role: Role; onLogout: () => void }
```
- 66px wide, `--pg-rail` background, fixed height (flex column)
- Top: `pg-emblem.png` (34px), 14px gap
- Nav items — icon + route + role gate:
  | Icon | Route | Visible to |
  |---|---|---|
  | `Receipt` | `/note-spese` | all |
  | `Car` | `/veicoli` | all |
  | `CheckCircle2` | `/approvazioni` | ≥ MANAGER |
  | `Wallet` | `/pagamenti` | ≥ FINANCE |
  | `Table2` | `/tabelle-aci` | ADMIN only |
  | `Users` | `/utenti` | ADMIN only |
- Active item: matched via `useLocation()`, `--pg-gold` bg, glyph `#2c2e26`, `strokeWidth={1.9}`
- Inactive: `--pg-rail-fg`, `strokeWidth={1.6}`
- Hover: `--pg-rail-2` background (180ms)
- Bottom pinned: Settings (`/impostazioni`, ADMIN only) + LogOut (all, calls `onLogout`)
- 44×44 buttons, borderRadius 11

### 4.2 `Topbar`
```ts
interface TopbarProps { crumb: string[] }
```
- 58px, `--pg-card` bg, `1px --pg-rule` bottom border
- Left: `pg-logo.png` (height 21) + `1px --pg-rule-2` divider + "Gestione Spese" (12.5px, 600, `--pg-muted`)
- Center: breadcrumb array with `ChevronRight` separators (13px). Last segment: `--pg-ink` 600; others: `--pg-muted` 500
- Right: search pill (visual only) + `<Avatar>` + name (12.5px 600 `--pg-ink`) + `t('roles.<ROLE>')` (10.5px `--pg-muted`)
- User always from `useAuth()`

### 4.3 `PageShell`
```ts
interface PageShellProps { children: ReactNode; detailTitle?: string }
```
- `<div class="pg">` with `display:flex`, `height:100vh`, `background:--pg-paper`
- `<Rail>` (receives role + logout from `useAuth()`)
- Column: `<Topbar crumb={...}>` + `<div class="pg-scroll">` wrapping children
- Breadcrumb derived from `useLocation()` → maps pathnames to Italian labels:
  ```ts
  const CRUMB: Record<string, string> = {
    '/note-spese':   'Note spese',
    '/approvazioni': 'Approvazioni',
    '/pagamenti':    'Pagamenti',
    '/veicoli':      'Veicoli',
    '/tabelle-aci':  'Tabelle ACI',
    '/impostazioni': 'Impostazioni',
    '/utenti':       'Utenti',
  };
  ```
  For `/note-spese/:id`: breadcrumb = `['Note spese', detailTitle ?? '…']`. `ReportDetailPage` passes `detailTitle={report.title}` once the report loads (renders `PageShell` with `detailTitle` prop). Until loaded, shows `'…'`.

### 4.4 `PageHead`
```ts
interface PageHeadProps {
  eyebrow?: string
  title: string
  accent?: string   // italic gold word appended after title
  sub?: string
  right?: ReactNode
}
```
- Eyebrow: `.pg-eyebrow.pg-eyebrow--red` (uppercase micro-label, gold)
- Title: `.pg-title` (serif 500, 30px); accent in `<em>` renders italic gold via CSS
- Sub: `.pg-meta` (12.5px, muted)
- Right slot: flex-end, gap 10 (for action buttons)

---

## 5. App.tsx changes

Current structure:
```tsx
<NavBar />
<Routes>...</Routes>
```

New structure:
```tsx
<PageShell>
  <Routes>...</Routes>
</PageShell>
```

`NavBar.tsx` is deleted (superseded by `Rail` + `Topbar` inside `PageShell`).

`LoginPage` is outside `PageShell` (pre-auth) — no change needed; the shell only renders for authenticated users (same guard as today).

---

## 6. Per-page redesign

All pages: wrap content root in `<main class="pg">` is already handled by `PageShell`. Remove all `fontFamily: 'system-ui'` inline styles. Remove `maxWidth / margin: auto` — `PageShell` handles centering at `maxWidth: 1040`.

### 6.1 LoginPage
- Split layout: `display:flex, height:100vh`
- **Left panel** (40%, `--pg-sand`): centred column — `pg-logo.png` (height 28), serif `<h1 class="pg-title">` (44px/500) with gold `<em>`, blurb text (14px, `--pg-body`)
- **Right panel** (60%, `--pg-paper`): centred form — `<PageHead>` eyebrow "Accedi al tuo account" + title; fields via `.pg-field / .pg-label / .pg-input`; error alert; `.pg-btn--primary` full-width "Accedi"; gold quiet "Password dimenticata?" link (visual only)
- No Rail/Topbar

### 6.2 ReportsPage
- `<PageHead eyebrow="Le mie note spese" title="Note" accent="spese" right={<CreateBtn />} />`
- Quick-create: `.pg-card` with `.pg-field` input + `.pg-btn--gold` "Crea nota spese"
- Table: `.pg-table` — title, `<StateBadge>`, `.pg-num` total, date, ChevronRight link

### 6.3 ReportDetailPage *(hero screen)*
- `<PageHead>`: eyebrow = `<StateBadge state={report.state} />`, title = `report.title` (serif), big total below as `38px serif 500 --pg-ink` + `.pg-num`
- `IN_REVISION` banner: blue info card (`--pg-blue-bg` border `--pg-blue`) with revision note text, author, timestamp
- Items: `.pg-table` with `<CatTag>`, mileage rows get an inline sub-row (vehicle, plate, rate, range chip)
- Totals strip: gold top border, per-category subtotals with `<CatTag>` + `.pg-num`, grand total
- Add-item card: `.pg-card` — category select, date, description, then either money fields or the mileage sub-form (vehicle/origin/destination/round-trip/km → calculate → range chip → entered km → justification if over-bound)
- **Inline revise form**: clicking "Richiedi revisione" sets `showReviseForm: boolean` state; a small `.pg-card` appears below action bar with a `.pg-textarea`, confirm (`.pg-btn--primary`) and cancel (`.pg-btn--ghost`). On confirm: `api.post('/reports/:id/revise', { comment })`, refresh, hide form
- Action bar driven by `actionsFor(state)`:
  - `submit` → `.pg-btn--primary` "Invia per approvazione"
  - `approve` → `.pg-btn--gold` "Approva"
  - `reject` → `.pg-btn--danger` "Respingi"
  - `revise` → `.pg-btn--ghost` "Richiedi revisione"
  - `send-payment` → `.pg-btn--primary` "Invia al pagamento"
  - `mark-paid` → `.pg-btn--gold` "Segna come pagata" (or `<MarkPaidForm>`)

### 6.4 ApprovalsPage
- `<PageHead>` + `<Filter>` with options: `['Tutti', t('states.READY_FOR_APPROVAL'), t('states.IN_REVISION')]` — filters the fetched list client-side; "Tutti" shows all
- One `.pg-card` per report: `<Avatar>` + owner name/role + title + `<StateBadge>` + meta row (items count, submitted date) + serif total + action buttons
- "Da verificare" amber badge shown when report has over-bound mileage items

### 6.5 PagamentiPage
- `<PageHead>` + `<Filter>` with options: `['Tutti', t('states.APPROVED'), t('states.SENT_FOR_PAYMENT'), t('states.PAID')]` — filters client-side; "Tutti" shows all
- Two `.pg-btn--ghost` CSV export links in right slot of `<PageHead>`
- `.pg-table`: owner, title, `<StateBadge>`, `.pg-num` total, action column:
  - APPROVED → `.pg-btn--primary` "Invia al pagamento"
  - SENT_FOR_PAYMENT → `.pg-btn--gold` "Segna come pagata"
  - PAID → green `<Check>` icon + reference string

### 6.6 VehiclesPage
- `<PageHead>` + add-vehicle `.pg-card` (label, plate, ACI rate search → `.pg-btn--gold` "Aggiungi veicolo")
- `.pg-table`: gold car tile (`.pg-gold-tint` icon tile), label, plate, ACI rate, `€/km` `.pg-num`, `<Switch onChange={toggleActive}>`, Disattiva/Riattiva `.pg-btn--ghost`

### 6.7 AciRatesPage
- Import `.pg-card`: file input + `.pg-btn--primary` "Importa" + `.pg-mono` format hint
- Green summary chip after successful import (year, rows, date)
- Search field + `.pg-table`: year, make, model, fuel pill (`.pg-badge` colored by fuel), variant, `.pg-num` €/km

### 6.8 SettingsPage
- Single `.pg-card`: eyebrow + tolerance number `.pg-input` + gold range bar (visual, `width: value%`, bg `--pg-gold`) + `.pg-btn--primary` "Salva"

### 6.9 UsersPage
- `<PageHead>` + new-user `.pg-card` (name, email, role select, manager select → `.pg-btn--gold` "Crea utente")
- `.pg-table`: name, email, `<RoleChip>`, manager, `<Switch onChange={toggleActive}>`, Disattiva/Riattiva `.pg-btn--ghost`

---

## 7. Breadcrumb for detail page

`ReportDetailPage` needs to surface `report.title` into the `<Topbar>` breadcrumb. `PageShell` accepts `detailTitle?: string` (see §4.3). The detail page passes it once the report is loaded. Until then it shows `'…'`. This avoids a context just for one string.

---

## 8. Files created / modified

| Action | File |
|---|---|
| Create | `packages/web/src/pellegrini.css` |
| Create | `packages/web/public/pg-logo.png` |
| Create | `packages/web/public/pg-emblem.png` |
| Modify | `packages/web/src/main.tsx` (add CSS import) |
| Modify | `packages/web/package.json` (add lucide-react) |
| Create | `packages/web/src/components/ui.tsx` |
| Create | `packages/web/src/components/chrome.tsx` |
| Modify | `packages/web/src/App.tsx` (swap NavBar for PageShell) |
| Delete | `packages/web/src/components/NavBar.tsx` |
| Modify | `packages/web/src/pages/LoginPage.tsx` |
| Modify | `packages/web/src/pages/ReportsPage.tsx` |
| Modify | `packages/web/src/pages/ReportDetailPage.tsx` |
| Modify | `packages/web/src/pages/ApprovalsPage.tsx` |
| Modify | `packages/web/src/pages/PagamentiPage.tsx` |
| Modify | `packages/web/src/pages/VehiclesPage.tsx` |
| Modify | `packages/web/src/pages/AciRatesPage.tsx` |
| Modify | `packages/web/src/pages/SettingsPage.tsx` |
| Modify | `packages/web/src/pages/UsersPage.tsx` |

---

## 9. Out of scope

- No server/API changes
- No new i18n keys (all labels use existing `t()` keys; "Password dimenticata?" is visual-only)
- No density/radius UI controls (CSS defaults ship as-is)
- No search functionality (search pill in Topbar is visual-only)
- No tests for visual components (existing tests are format/logic only and remain untouched)
