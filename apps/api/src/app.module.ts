import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { ProjectsModule } from "./projects/projects.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";
import { TemplatesModule } from "./templates/templates.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    KnowledgeModule,
    TemplatesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
