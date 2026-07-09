import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildCallGreeting,
  formatOperatorDisplayName,
  getBusinessTemplate,
  inferOperatorGender,
} from "@aivoiceos/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KnowledgeService } from "../knowledge/knowledge.service";
import { AGENT_TOOL_NAMES, type AgentToolName } from "./agent-tools";
import {
  elevenConfigured,
  ensureProjectElevenAgent,
  getElevenConversationToken,
} from "./elevenlabs.adapter";

/**
 * Voice runtime: issue browser test-call sessions and execute knowledge tools
 * scoped to the caller's organization + project.
 */
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

  private businessLabelOf(project: {
    businessTemplate: string;
    businessLabel: string | null;
  }) {
    if (project.businessLabel?.trim()) return project.businessLabel.trim();
    return getBusinessTemplate(project.businessTemplate)?.label || project.businessTemplate;
  }

  /** Start a browser WebRTC test call for this project (ElevenLabs for now). */
  async createSession(organizationId: string, projectId: string) {
    const project = await this.loadProject(organizationId, projectId);

    if (!elevenConfigured()) {
      throw new BadRequestException(
        "Səs API açarı yoxdur. Serverə ELEVENLABS_API_KEY əlavə edin (Azure adapter tezliklə).",
      );
    }

    const agent = project.agent!;
    const businessLabel = this.businessLabelOf(project);
    const gender = inferOperatorGender(agent.persona, agent.voiceId);
    const operatorName = formatOperatorDisplayName(agent.persona || "Operator", gender);
    const firstMessage = buildCallGreeting({
      persona: agent.persona,
      businessLabel,
      templateId: project.businessTemplate,
      voiceId: agent.voiceId,
      customGreeting: agent.greeting,
    });

    const cached = agent.externalAgentId || null;

    const { agent_id } = await ensureProjectElevenAgent({
      projectId: project.id,
      projectName: project.name,
      persona: agent.persona,
      prompt: agent.prompt,
      firstMessage,
      language: agent.language || "az",
      cachedAgentId: cached,
    });

    if (agent.externalAgentId !== agent_id) {
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
      operatorName,
      operatorGender: gender,
      firstMessage,
      tools: [...AGENT_TOOL_NAMES],
    };
  }

  async runTool(
    organizationId: string,
    projectId: string,
    name: string,
    rawArgs: Record<string, unknown> = {},
  ) {
    await this.loadProject(organizationId, projectId);
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
