import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    return { ok: true, service: "ai-voice-os-api", version: "0.2.0", db };
  }
}
