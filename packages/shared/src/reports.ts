export const REPORT_STATES = [
  "CREATED",
  "READY_FOR_APPROVAL",
  "IN_REVISION",
  "APPROVED",
  "REJECTED",
  "SENT_FOR_PAYMENT",
  "PAID",
] as const;
export type ReportState = (typeof REPORT_STATES)[number];

// Full domain vocabulary. MILEAGE is modelled now but only accepted by the API
// starting in Slice 3; this slice accepts the money categories only.
export const CATEGORIES = ["MILEAGE", "MEALS_LODGING", "TRANSPORT", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];

export const MONEY_CATEGORIES = ["MEALS_LODGING", "TRANSPORT", "OTHER"] as const;
export type MoneyCategory = (typeof MONEY_CATEGORIES)[number];

export type ReportAction =
  | "submit"
  | "approve"
  | "reject"
  | "revise"
  | "send-payment"
  | "mark-paid";

// Which kind of actor a transition requires. The relationship behind MANAGER
// (is the requester the report owner's manager?) is resolved server-side; a
// FINANCE/ADMIN user always satisfies MANAGER as an override (see service).
export type ActorKind = "OWNER" | "MANAGER" | "FINANCE";

export interface TransitionDef {
  action: ReportAction;
  from: ReportState;
  to: ReportState;
  actor: ActorKind;
}

export const TRANSITIONS: readonly TransitionDef[] = [
  { action: "submit", from: "CREATED", to: "READY_FOR_APPROVAL", actor: "OWNER" },
  { action: "submit", from: "IN_REVISION", to: "READY_FOR_APPROVAL", actor: "OWNER" },
  { action: "approve", from: "READY_FOR_APPROVAL", to: "APPROVED", actor: "MANAGER" },
  { action: "reject", from: "READY_FOR_APPROVAL", to: "REJECTED", actor: "MANAGER" },
  { action: "revise", from: "READY_FOR_APPROVAL", to: "IN_REVISION", actor: "MANAGER" },
  { action: "send-payment", from: "APPROVED", to: "SENT_FOR_PAYMENT", actor: "FINANCE" },
  { action: "mark-paid", from: "SENT_FOR_PAYMENT", to: "PAID", actor: "FINANCE" },
] as const;

export function findTransition(
  from: ReportState,
  action: ReportAction,
): TransitionDef | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.action === action);
}

export function actionsFor(from: ReportState): ReportAction[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.action);
}

// The "on hold" phase (design §5): the employee may freely edit the report and
// its items until a manager decision exists. READY_FOR_APPROVAL is intentionally
// editable — submitting does NOT lock editing; the manager always reviews the
// latest version. Editing only stops once the report is APPROVED or REJECTED.
const EDITABLE_STATES: readonly ReportState[] = [
  "CREATED",
  "READY_FOR_APPROVAL",
  "IN_REVISION",
];

// Employee may edit the report and its items only before a manager decision.
export function isEditableState(state: ReportState): boolean {
  return EDITABLE_STATES.includes(state);
}
