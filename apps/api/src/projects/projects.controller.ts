import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { MinRole } from "../common/roles.decorator";
import { CurrentUser, type RequestUser } from "../common/current-user.decorator";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateAgentDto } from "./dto/update-agent.dto";
import { SetStatusDto } from "./dto/set-status.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.projects.list(user.organizationId);
  }

  @Get(":id")
  get(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.projects.get(user.organizationId, id);
  }

  @MinRole("editor")
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.organizationId, dto);
  }

  @MinRole("editor")
  @Patch(":id/agent")
  updateAgent(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.projects.updateAgent(user.organizationId, id, dto);
  }

  @MinRole("editor")
  @Patch(":id/status")
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.projects.setStatus(user.organizationId, id, dto.status);
  }

  @MinRole("org_admin")
  @Delete(":id")
  remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.projects.remove(user.organizationId, id);
  }
}
