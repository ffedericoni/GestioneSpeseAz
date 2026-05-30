import { describe, it, expect } from "vitest";
import { ROLES, hasAtLeast, canManageUsers, type Role } from "./roles.js";

describe("roles", () => {
  it("exposes the four roles", () => {
    expect(ROLES).toEqual(["EMPLOYEE", "MANAGER", "FINANCE", "ADMIN"]);
  });

  it("hasAtLeast respects the privilege ordering", () => {
    expect(hasAtLeast("ADMIN", "FINANCE")).toBe(true);
    expect(hasAtLeast("FINANCE", "FINANCE")).toBe(true);
    expect(hasAtLeast("EMPLOYEE", "MANAGER")).toBe(false);
    expect(hasAtLeast("MANAGER", "ADMIN")).toBe(false);
  });

  it("only ADMIN can manage users", () => {
    const expected: Record<Role, boolean> = {
      EMPLOYEE: false,
      MANAGER: false,
      FINANCE: false,
      ADMIN: true,
    };
    for (const role of ROLES) {
      expect(canManageUsers(role)).toBe(expected[role]);
    }
  });
});
