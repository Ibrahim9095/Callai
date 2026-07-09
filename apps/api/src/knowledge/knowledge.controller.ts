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
import { KnowledgeService } from "./knowledge.service";
import { CreateCollectionDto, ImportCsvDto, RecordDto } from "./dto/knowledge.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("projects/:projectId/collections")
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  listCollections(@CurrentUser() user: RequestUser, @Param("projectId") projectId: string) {
    return this.knowledge.listCollections(user.organizationId, projectId);
  }

  @MinRole("editor")
  @Post()
  createCollection(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Body() dto: CreateCollectionDto,
  ) {
    return this.knowledge.createCollection(user.organizationId, projectId, dto);
  }

  @MinRole("editor")
  @Delete(":collectionId")
  deleteCollection(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Param("collectionId") collectionId: string,
  ) {
    return this.knowledge.deleteCollection(user.organizationId, projectId, collectionId);
  }

  @Get(":collectionId/records")
  listRecords(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Param("collectionId") collectionId: string,
  ) {
    return this.knowledge.listRecords(user.organizationId, projectId, collectionId);
  }

  @MinRole("editor")
  @Post(":collectionId/records")
  createRecord(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Param("collectionId") collectionId: string,
    @Body() dto: RecordDto,
  ) {
    return this.knowledge.createRecord(user.organizationId, projectId, collectionId, dto.data);
  }

  @MinRole("editor")
  @Patch(":collectionId/records/:recordId")
  updateRecord(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Param("collectionId") collectionId: string,
    @Param("recordId") recordId: string,
    @Body() dto: RecordDto,
  ) {
    return this.knowledge.updateRecord(
      user.organizationId,
      projectId,
      collectionId,
      recordId,
      dto.data,
    );
  }

  @MinRole("editor")
  @Delete(":collectionId/records/:recordId")
  deleteRecord(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Param("collectionId") collectionId: string,
    @Param("recordId") recordId: string,
  ) {
    return this.knowledge.deleteRecord(user.organizationId, projectId, collectionId, recordId);
  }

  @MinRole("editor")
  @Post(":collectionId/import")
  importCsv(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Param("collectionId") collectionId: string,
    @Body() dto: ImportCsvDto,
  ) {
    return this.knowledge.importCsv(
      user.organizationId,
      projectId,
      collectionId,
      dto.csv,
      dto.delimiter || ",",
    );
  }
}
