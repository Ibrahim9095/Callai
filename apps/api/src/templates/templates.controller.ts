import { Controller, Get, UseGuards } from "@nestjs/common";
import { listBusinessTemplates } from "@aivoiceos/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@UseGuards(JwtAuthGuard)
@Controller("templates")
export class TemplatesController {
  @Get()
  list() {
    return listBusinessTemplates();
  }
}
