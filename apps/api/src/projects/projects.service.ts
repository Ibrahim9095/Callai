import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  getBusinessTemplate,
  buildCustomStarterPrompt,
  CUSTOM_TEMPLATE_ID,
  DEFAULT_VOICE,
} from "@aivoiceos/shared";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateAgentDto } from "./dto/update-agent.dto";
import type { ProjectStatus } from "@prisma/client";

/**
 * All methods are scoped by organizationId (tenant). No query ever runs without
 * the tenant filter — this is the application-layer isolation guarantee
 * (see docs/DECISIONS.md ADR-0001). DB-level RLS is a planned hardening step.
 */
@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { agent: true },
    });
  }

  async get(organizationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      include: { agent: true },
    });
    if (!project) throw new NotFoundException("Project tapılmadı");
    return project;
  }

  async create(organizationId: string, dto: CreateProjectDto) {
    let businessTemplate: string;
    let businessLabel: string;
    let persona: string;
    let prompt: string;

    if (dto.businessTemplate === CUSTOM_TEMPLATE_ID) {
      const customType = (dto.customType || "").trim();
      if (!customType) {
        throw new BadRequestException("Xüsusi biznes üçün biznes növünü yazın");
      }
      businessTemplate = CUSTOM_TEMPLATE_ID;
      businessLabel = customType;
      persona = `${customType} operatoru`;
      prompt = buildCustomStarterPrompt(customType);
    } else {
      const template = getBusinessTemplate(dto.businessTemplate);
      if (!template) throw new BadRequestException("Naməlum biznes şablonu");
      businessTemplate = template.id;
      businessLabel = template.label;
      persona = template.label;
      prompt = template.starterPrompt;
    }

    return this.prisma.project.create({
      data: {
        organizationId,
        name: dto.name,
        businessTemplate,
        businessLabel,
        status: "draft",
        agent: {
          create: {
            persona,
            prompt,
            language: "az",
            voiceProvider: DEFAULT_VOICE.provider,
            voiceId: DEFAULT_VOICE.voiceId,
            greeting: null,
            active: false,
          },
        },
      },
      include: { agent: true },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.get(organizationId, id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  async updateAgent(organizationId: string, projectId: string, dto: UpdateAgentDto) {
    await this.get(organizationId, projectId);
    await this.prisma.agent.update({
      where: { projectId },
      data: { ...dto },
    });
    return this.get(organizationId, projectId);
  }

  async setStatus(organizationId: string, projectId: string, status: ProjectStatus) {
    const project = await this.get(organizationId, projectId);
    if (status === "active" && !project.agent?.active) {
      // Activating a project also activates its agent.
      await this.prisma.agent.update({ where: { projectId }, data: { active: true } });
    }
    await this.prisma.project.update({ where: { id: projectId }, data: { status } });
    return this.get(organizationId, projectId);
  }
}
