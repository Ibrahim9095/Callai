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

  /** Browser voice session (provider-agnostic credentials). */
  @MinRole("editor")
  @Post("session")
  createSession(@CurrentUser() user: RequestUser, @Param("projectId") projectId: string) {
    return this.voice.createSession(user.organizationId, projectId);
  }

  /** Free neural TTS for greeting / arbitrary text. */
  @MinRole("editor")
  @Post("speak")
  speak(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Body() body: { text?: string },
  ) {
    return this.voice.speak(user.organizationId, projectId, body || {});
  }

  /** Conversational turn: user text → LLM reply + TTS audio. */
  @MinRole("editor")
  @Post("turn")
  turn(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Body()
    body: {
      userText?: string;
      history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    },
  ) {
    return this.voice.turn(user.organizationId, projectId, body || {});
  }

  /** Execute a knowledge tool during a live call. */
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
