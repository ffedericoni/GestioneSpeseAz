export interface ApiError {
  status: number;
  code?: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
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

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};

export type Role = "EMPLOYEE" | "MANAGER" | "FINANCE" | "ADMIN";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}
