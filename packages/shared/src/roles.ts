export const ROLES = ["EMPLOYEE", "MANAGER", "FINANCE", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Higher index = more privilege. FINANCE and ADMIN both manage payment;
// ADMIN additionally manages users and configuration.
const RANK: Record<Role, number> = {
  EMPLOYEE: 0,
  MANAGER: 1,
  FINANCE: 2,
  ADMIN: 3,
};

export function hasAtLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export function canManageUsers(role: Role): boolean {
  return role === "ADMIN";
}
