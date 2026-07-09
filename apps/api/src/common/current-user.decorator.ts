import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Role } from "@aivoiceos/shared";

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as RequestUser;
  },
);
