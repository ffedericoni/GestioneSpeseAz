import type { Role, ReportState, Category, MoneyCategory } from "@gsa/shared";
export type { Role, ReportState, Category, MoneyCategory };

export interface ApiError {
  status: number;
  code?: string;
  body?: Record<string, unknown>;
}

const API_BASE = "/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let code: string | undefined;
    try {
      code = (await res.json()).error;
    } catch {
      code = undefined;
    }
    const err: ApiError = { status: res.status, code };
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData, // browser sets the multipart boundary; do NOT set Content-Type
  });
  if (!res.ok) {
    let body: Record<string, unknown> | undefined;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    // Surface the whole parsed body (e.g. { error, righe }) so callers can show
    // row-level import errors, not just the code.
    const err: ApiError = { status: res.status, code: body?.error as string | undefined, body };
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload,
};

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface ReportSummary {
  id: string;
  ownerId: string;
  title: string;
  state: ReportState;
  totalCents: number;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface ReportItem {
  id: string;
  category: Category;
  date: string;
  description: string;
  amountCents: number;
  vatCents: number | null;
  notes: string | null;
}

export interface ReportEvent {
  fromState: ReportState;
  toState: ReportState;
  comment: string | null;
  createdAt: string;
}

export interface ReportDetail extends ReportSummary {
  owner: { id: string; fullName: string; managerId: string | null };
  items: ReportItem[];
  events: ReportEvent[];
}

export interface NewItemInput {
  category: MoneyCategory;
  date: string;
  description: string;
  amountCents: number;
  vatCents?: number | null;
  notes?: string | null;
}

export interface AciRate {
  id: string;
  year: number;
  make: string;
  model: string;
  fuel: string;
  variant: string;
  costPerKm: string; // decimal serialized as string
}

export interface Vehicle {
  id: string;
  label: string;
  plate: string | null;
  active: boolean;
  aciRateId: string;
  aciRate: AciRate;
}

export interface AciImportBatch {
  id: string;
  year: number;
  fileName: string;
  rowCount: number;
  importedAt: string;
}

export interface ToleranceSetting {
  tolerancePercent: number;
}
