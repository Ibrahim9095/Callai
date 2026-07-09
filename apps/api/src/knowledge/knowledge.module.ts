import { Module } from "@nestjs/common";
import { KnowledgeService } from "./knowledge.service";
import { KnowledgeController } from "./knowledge.controller";
import { FilesController } from "./files.controller";

@Module({
  providers: [KnowledgeService],
  controllers: [KnowledgeController, FilesController],
})
export class KnowledgeModule {}
