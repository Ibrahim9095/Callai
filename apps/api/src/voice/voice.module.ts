import { Module } from "@nestjs/common";
import { KnowledgeModule } from "../knowledge/knowledge.module";
import { VoiceService } from "./voice.service";
import { VoiceController } from "./voice.controller";

@Module({
  imports: [KnowledgeModule],
  providers: [VoiceService],
  controllers: [VoiceController],
})
export class VoiceModule {}
