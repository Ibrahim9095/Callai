import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildCallGreeting,
  buildIdentityPrompt,
  exactPersonaName,
  extractPersonaName,
  getBusinessTemplate,
  inferOperatorGender,
} from "@aivoiceos/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KnowledgeService } from "../knowledge/knowledge.service";
import { AGENT_TOOL_NAMES, type AgentToolName } from "./agent-tools";
import {
  AZ_PREMIUM_STYLE,
  VOICE_RUNTIME_RULES,
  elevenConfigured,
  ensureProjectElevenAgent,
  getElevenConversationToken,
} from "./elevenlabs.adapter";

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

  async createSession(organizationId: string, projectId: string) {
    // Always re-read from DB so the latest saved persona is used (no stale cache).
    const project = await this.loadProject(organizationId, projectId);

    if (!elevenConfigured()) {
      throw new BadRequestException(
        "Səs API açarı yoxdur. Serverə ELEVENLABS_API_KEY əlavə edin.",
      );
    }

    const agent = project.agent!;
    const businessLabel = this.businessLabelOf(project);
    const persona = exactPersonaName(agent.persona);
    const gender = inferOperatorGender(persona, agent.voiceId);

    // Drop stale greeting that still mentions an old name (e.g. Leyla after rename to Kamran)
    let greeting = (agent.greeting || "").trim() || null;
    if (greeting && !greeting.toLowerCase().includes(persona.toLowerCase())) {
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
      voiceId: agent.voiceId,
      customGreeting: greeting,
      projectName: project.name,
    });

    const identity = buildIdentityPrompt({
      persona,
      businessLabel,
      templateId: project.businessTemplate,
      voiceId: agent.voiceId,
      projectName: project.name,
      firstMessage,
    });

    const fullPrompt = [
      identity,
      AZ_PREMIUM_STYLE,
      (agent.prompt || "").trim(),
      VOICE_RUNTIME_RULES,
      `SƏNİN ADIN İNDİ: «${persona}». Başqa ad (Leyla və s.) demə.`,
      "ZƏNGİ HEÇ VAXT KƏSMƏ. Yalnız müştəri bitirir.",
    ]
      .filter(Boolean)
      .join("\n\n");

    // After "Yadda saxla", externalAgentId is cleared → recreate with new name/voice.
    // Otherwise PATCH the cached agent with fresh first_message + prompt (no stale Leyla).
    const { agent_id, recreated } = await ensureProjectElevenAgent({
      projectId: project.id,
      projectName: project.name,
      persona,
      prompt: fullPrompt,
      firstMessage,
      language: agent.language || "az",
      keywords: [persona, extractPersonaName(persona), project.name, businessLabel].filter(
        Boolean,
      ) as string[],
      cachedAgentId: agent.externalAgentId,
      forceRecreate: agent.externalAgentId == null,
      catalogVoiceId: agent.voiceId,
      voiceProvider: agent.voiceProvider,
      gender,
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
      // Exact typed name — never "Leyla xanım"
      operatorName: persona,
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
