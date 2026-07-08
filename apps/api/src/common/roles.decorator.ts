import { SetMetadata } from "@nestjs/common";
import type { Role } from "@aivoiceos/shared";

export const ROLES_KEY = "roles";

/** Restrict a route to a minimum role (see RolesGuard). */
export const MinRole = (role: Role) => SetMetadata(ROLES_KEY, role);
