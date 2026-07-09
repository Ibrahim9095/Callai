import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  buildCallGreeting,
  buildIdentityPrompt,
  extractPersonaName,
  getBusinessTemplate,
  resolveOperator,
} from "@aivoiceos/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KnowledgeService } from "../knowledge/knowledge.service";
import { AGENT_TOOL_NAMES, type AgentToolName } from "./agent-tools";
import {
  elevenConfigured,
  ensureProjectElevenAgent,
  getElevenConversationToken,
} from "./elevenlabs.adapter";
import {
  inactiveProjectMessage,
  isProjectVoiceActive,
} from "./call-lifecycle";
import { composeVoicePrompt } from "./prompt-composer";

@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
  ) {}

  private async loadProject(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      include: { agent: true },
    });
    if (!project) throw new NotFoundException("Project tapılmadı");
    if (!project.agent) throw new BadRequestException("Agent konfiqurasiyası yoxdur");
    return project;
  }

  /** Voice Engine gate — inactive projects never start ASR / WebRTC / tools. */
  private assertVoiceActive(project: { status: string; name: string }) {
    if (!isProjectVoiceActive(project.status)) {
      throw new ForbiddenException(inactiveProjectMessage(project.status));
    }
  }

  private businessLabelOf(project: {
    businessTemplate: string;
    businessLabel: string | null;
  }) {
    if (project.businessLabel?.trim()) return project.businessLabel.trim();
    return getBusinessTemplate(project.businessTemplate)?.label || project.businessTemplate;
  }

  async createSession(organizationId: string, projectId: string) {
    const project = await this.loadProject(organizationId, projectId);
    this.assertVoiceActive(project);

    if (!elevenConfigured()) {
      throw new BadRequestException(
        "Səs API açarı yoxdur. Serverə ELEVENLABS_API_KEY əlavə edin.",
      );
    }

    const agent = project.agent!;
    const businessLabel = this.businessLabelOf(project);
    const operator = resolveOperator(agent.persona);
    const persona = operator.name;
    const gender = operator.gender;
    const companyName = (project.name || businessLabel || "").trim();

    if ((agent.persona || "").trim() !== persona) {
      await this.prisma.agent.update({
        where: { projectId },
        data: {
          persona,
          voiceProvider: operator.voiceProvider,
          voiceId: operator.voiceId,
          externalAgentId: null,
          greeting: null,
        },
      });
    }

    let greeting = (agent.greeting || "").trim() || null;
    if (
      greeting &&
      (!greeting.toLowerCase().includes(persona.toLowerCase()) ||
        (companyName && !greeting.toLowerCase().includes(companyName.toLowerCase().slice(0, 6))))
    ) {
      greeting = null;
      await this.prisma.agent.update({
        where: { projectId },
        data: { greeting: null },
      });
    }

    const firstMessage = buildCallGreeting({
      persona,
      businessLabel,
      templateId: project.businessTemplate,
      voiceId: operator.voiceId,
      customGreeting: greeting,
      projectName: project.name,
      companyName,
    });

    const identity = buildIdentityPrompt({
      persona,
      businessLabel,
      templateId: project.businessTemplate,
      voiceId: operator.voiceId,
      projectName: project.name,
      companyName,
      firstMessage,
    });

    const { fullPrompt, userInstruction } = composeVoicePrompt({
      identityBlock: identity,
      systemPrompt: agent.prompt || "",
      userPrompt: (agent as any).userPrompt || "",
      persona,
      companyName,
    });

    // Always PATCH with built_in_tools.end_call:null so cached agents cannot hang up.
    const { agent_id, recreated } = await ensureProjectElevenAgent({
      projectId: project.id,
      projectName: project.name,
      persona,
      prompt: fullPrompt,
      firstMessage,
      language: agent.language || "az",
      keywords: [
        persona,
        extractPersonaName(persona),
        project.name,
        businessLabel,
        companyName,
      ].filter(Boolean) as string[],
      cachedAgentId: agent.externalAgentId,
      forceRecreate: agent.externalAgentId == null,
      catalogVoiceId: operator.voiceId,
      voiceProvider: operator.voiceProvider,
      gender,
      temperature: (agent as any).temperature ?? 0.45,
      maxTokens: (agent as any).maxTokens ?? null,
    });

    if (agent.externalAgentId !== agent_id || recreated) {
      await this.prisma.agent.update({
        where: { projectId },
        data: { externalAgentId: agent_id },
      });
    }

    const { token } = await getElevenConversationToken(agent_id);
    return {
      provider: "elevenlabs" as const,
      token,
      agent_id,
      projectId: project.id,
      projectName: project.name,
      businessLabel,
      companyName,
      operatorId: operator.id,
      operatorName: persona,
      operatorGender: gender,
      firstMessage,
      userPrompt: userInstruction,
      projectStatus: project.status,
      tools: [...AGENT_TOOL_NAMES],
    };
  }

  async runTool(
    organizationId: string,
    projectId: string,
    name: string,
    rawArgs: Record<string, unknown> = {},
  ) {
    const project = await this.loadProject(organizationId, projectId);
    this.assertVoiceActive(project);

    const args =
      rawArgs.parameters && typeof rawArgs.parameters === "object"
        ? (rawArgs.parameters as Record<string, unknown>)
        : rawArgs;

    if (!AGENT_TOOL_NAMES.includes(name as AgentToolName)) {
      throw new NotFoundException(`Alət tapılmadı: ${name}`);
    }

    switch (name as AgentToolName) {
      case "list_collections":
        return this.knowledge.agentListCollections(organizationId, projectId);
      case "search_records":
        return this.knowledge.agentSearch(organizationId, projectId, {
          query: args.query as string | undefined,
          collection: args.collection as string | undefined,
          filters: (args.filters as Record<string, unknown>) || undefined,
          limit: args.limit as number | undefined,
        });
      case "create_record":
        return this.knowledge.agentCreateRecord(organizationId, projectId, {
          collection: String(args.collection || ""),
          data: (args.data as Record<string, unknown>) || {},
        });
      case "update_record":
        return this.knowledge.agentUpdateRecord(organizationId, projectId, {
          recordId: String(args.recordId || ""),
          collection: args.collection as string | undefined,
          data: (args.data as Record<string, unknown>) || {},
        });
      default:
        throw new NotFoundException(`Alət tapılmadı: ${name}`);
    }
  }
}
