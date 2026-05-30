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
