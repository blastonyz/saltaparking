export type UserRole = "admin" | "permisionario" | "usuario";
export type PermisionarioStatus = "none" | "pending" | "approved";

export const DEFAULT_ROLE: UserRole = "usuario";

export function getAdminEmailSet(): Set<string> {
  const csv = process.env.ADMIN_EMAILS || "";
  const emails = csv
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return new Set(emails);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAdminEmailSet().has(email.toLowerCase());
}
