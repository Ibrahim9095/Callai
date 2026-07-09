/** Platform-wide RBAC roles. Ordered from most to least privileged. */
export const ROLES = ["super_admin", "org_admin", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Role → rank (higher = more privileged). Used for hasAtLeast() checks. */
export const ROLE_RANK: Record<Role, number> = {
  super_admin: 40,
  org_admin: 30,
  editor: 20,
  viewer: 10,
};

export function hasAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
