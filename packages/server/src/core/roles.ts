// Role logic now lives in @gsa/shared so the web app can share it. This module
// re-exports it so existing imports (../core/roles.js) keep working unchanged.
export { ROLES, hasAtLeast, canManageUsers, type Role } from "@gsa/shared";
