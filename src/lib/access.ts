/**
 * Access rules in one place. Roles are resolved per (document, user):
 *   owner  - created the document; can edit, rename, share, delete
 *   editor - granted by the owner; can edit and rename
 *   viewer - granted by the owner; read-only
 */
export type Role = "owner" | "editor" | "viewer";
export type ShareRole = Exclude<Role, "owner">;

export const SHARE_ROLES: ShareRole[] = ["editor", "viewer"];

export const can = {
  view: (role: Role | null) => role !== null,
  edit: (role: Role | null) => role === "owner" || role === "editor",
  rename: (role: Role | null) => role === "owner" || role === "editor",
  share: (role: Role | null) => role === "owner",
  delete: (role: Role | null) => role === "owner",
};
