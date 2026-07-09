import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { MinRole } from "../common/roles.decorator";
import { CurrentUser, type RequestUser } from "../common/current-user.decorator";
import { KnowledgeService } from "./knowledge.service";

type UploadedExcel = { originalname: string; buffer: Buffer; size: number };

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("projects/:projectId/files")
export class FilesController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param("projectId") projectId: string) {
    return this.knowledge.listFiles(user.organizationId, projectId);
  }

  @MinRole("editor")
  @Post()
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 15 * 1024 * 1024 } }), // 15 MB
  )
  upload(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @UploadedFile() file: UploadedExcel,
  ) {
    if (!file) throw new BadRequestException("Fayl göndərilmədi");
    return this.knowledge.uploadFile(user.organizationId, projectId, file.originalname, file.buffer);
  }

  @MinRole("editor")
  @Delete(":fileId")
  remove(
    @CurrentUser() user: RequestUser,
    @Param("projectId") projectId: string,
    @Param("fileId") fileId: string,
  ) {
    return this.knowledge.deleteFile(user.organizationId, projectId, fileId);
  }
}
