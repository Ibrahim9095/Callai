import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { MinRole } from "../common/roles.decorator";
import { CurrentUser, type RequestUser } from "../common/current-user.decorator";
import { VoiceService } from "./voice.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("projects/:projectId/voice")
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** Browser voice test-call session (ElevenLabs WebSocket signed URL + tools). */
  @MinRole("editor")
  @Post("session")
  createSession(@CurrentUser() user: RequestUser, @Param("projectId") projectId: string) {
    return this.voice.createSession(user.organizationId, projectId);
  }

  /** Execute a knowledge tool during a live call (client-tool callback). */
  @MinRole("editor")
  @Post("tools/:name")
  runTool(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Param("name") name: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.voice.runTool(user.organizationId, projectId, name, body || {});
  }
}
