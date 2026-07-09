import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasAtLeast, type Role } from "@aivoiceos/shared";
import { ROLES_KEY } from "./roles.decorator";
import type { RequestUser } from "./current-user.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const user = context.switchToHttp().getRequest().user as RequestUser | undefined;
    if (!user || !hasAtLeast(user.role, required)) {
      throw new ForbiddenException("Bu əməliyyat üçün icazəniz yoxdur");
    }
    return true;
  }
}
