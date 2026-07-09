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
  resolveOperator,
  voiceForOperator,
  normalizeAzPhone,
  getAzOperator,
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
      include: { agent: true, phoneNumber: true },
    });
  }

  async get(organizationId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      include: { agent: true, phoneNumber: true },
    });
    if (!project) throw new NotFoundException("Project tapılmadı");
    return project;
  }

  async create(organizationId: string, dto: CreateProjectDto) {
    let businessTemplate: string;
    let businessLabel: string;
    let prompt: string;

    if (dto.businessTemplate === CUSTOM_TEMPLATE_ID) {
      const customType = (dto.customType || "").trim();
      if (!customType) {
        throw new BadRequestException("Xüsusi biznes üçün biznes növünü yazın");
      }
      businessTemplate = CUSTOM_TEMPLATE_ID;
      businessLabel = customType;
      prompt = buildCustomStarterPrompt(customType);
    } else {
      const template = getBusinessTemplate(dto.businessTemplate);
      if (!template) throw new BadRequestException("Naməlum biznes şablonu");
      businessTemplate = template.id;
      businessLabel = template.label;
      prompt = template.starterPrompt;
    }

    // Catalog only: Leyla | Samir (extensible via OPERATOR_CATALOG)
    const operator = resolveOperator(dto.operatorId || dto.operator || "leyla");
    const voice = voiceForOperator(operator.id);

    return this.prisma.project.create({
      data: {
        organizationId,
        name: dto.name,
        businessTemplate,
        businessLabel,
        status: "draft",
        agent: {
          create: {
            persona: operator.name,
            prompt,
            language: "az",
            voiceProvider: voice.voiceProvider,
            voiceId: voice.voiceId,
            greeting: null,
            active: false,
          },
        },
      },
      include: { agent: true, phoneNumber: true },
    });
  }

  /**
   * Assign an Azerbaijani phone number to a project. Validates/normalizes to
   * E.164 and stores it. Live PSTN routing is provisioned later via a SIP
   * TelephonyProvider (ADR-0004); status stays "pending" until then.
   */
  async assignPhone(organizationId: string, projectId: string, rawNumber: string) {
    await this.get(organizationId, projectId);
    const e164 = normalizeAzPhone(rawNumber);
    if (!e164) {
      throw new BadRequestException(
        "Yalnız Azərbaycan nömrəsi (+994) qəbul olunur. Məs: 050 123 45 67",
      );
    }
    const operator = getAzOperator(e164);
    await this.prisma.phoneNumber.upsert({
      where: { projectId },
      update: { e164, operator, provider: "manual", status: "pending" },
      create: { projectId, e164, operator, provider: "manual", status: "pending" },
    });
    return this.get(organizationId, projectId);
  }

  async removePhone(organizationId: string, projectId: string) {
    await this.get(organizationId, projectId);
    await this.prisma.phoneNumber.deleteMany({ where: { projectId } });
    return this.get(organizationId, projectId);
  }

  async remove(organizationId: string, id: string) {
    await this.get(organizationId, id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  async updateAgent(organizationId: string, projectId: string, dto: UpdateAgentDto) {
    await this.get(organizationId, projectId);
    const voiceAffecting =
      dto.persona !== undefined ||
      dto.operatorId !== undefined ||
      dto.prompt !== undefined ||
      dto.userPrompt !== undefined ||
      dto.greeting !== undefined ||
      dto.language !== undefined ||
      dto.voiceProvider !== undefined ||
      dto.voiceId !== undefined ||
      dto.speechSpeed !== undefined;

    const data: Record<string, unknown> = {};

    if (dto.prompt !== undefined) data.prompt = dto.prompt;
    if (dto.userPrompt !== undefined) data.userPrompt = dto.userPrompt;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.greeting !== undefined) data.greeting = dto.greeting;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.speechSpeed !== undefined) data.speechSpeed = dto.speechSpeed;

    // Catalog only: Leyla | Samir
    if (dto.operatorId !== undefined || dto.persona !== undefined) {
      const raw = String(dto.operatorId || dto.persona || "").trim();
      const operator = resolveOperator(raw);
      const matched =
        operator.name.toLowerCase() === raw.toLowerCase() ||
        operator.id === raw.toLowerCase();
      if (!matched) {
        throw new BadRequestException("Operator yalnız Leyla və ya Samir ola bilər");
      }
      data.persona = operator.name;
      data.voiceProvider = operator.voiceProvider;
      data.voiceId = operator.voiceId;
      data.externalAgentId = null;
      // Keep greeting unless explicitly cleared — do not wipe on operator change
      if (dto.greeting !== undefined) data.greeting = dto.greeting;
    } else {
      if (dto.voiceProvider !== undefined) data.voiceProvider = dto.voiceProvider;
      if (dto.voiceId !== undefined) data.voiceId = dto.voiceId;
    }

    if (voiceAffecting) {
      data.externalAgentId = null;
    }

    await this.prisma.agent.update({
      where: { projectId },
      data,
    });
    return this.get(organizationId, projectId);
  }

  async setStatus(organizationId: string, projectId: string, status: ProjectStatus) {
    const project = await this.get(organizationId, projectId);
    if (status === "active") {
      await this.prisma.agent.update({ where: { projectId }, data: { active: true } });
    } else {
      // paused / draft → Voice Engine must not run
      await this.prisma.agent.update({
        where: { projectId },
        data: { active: false, externalAgentId: null },
      });
    }
    await this.prisma.project.update({ where: { id: projectId }, data: { status } });
    return this.get(organizationId, projectId);
  }
}
