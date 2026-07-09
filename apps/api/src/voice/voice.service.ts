import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  buildCallGreeting,
  buildIdentityPrompt,
  getBusinessTemplate,
  normalizeSpeechSpeed,
  resolveOperator,
  speechSpeedToEdgeRate,
} from "@aivoiceos/shared";
import { PrismaService } from "../prisma/prisma.service";
import { KnowledgeService } from "../knowledge/knowledge.service";
import { AGENT_TOOL_NAMES, type AgentToolName } from "./agent-tools";
import {
  inactiveProjectMessage,
  isProjectVoiceActive,
} from "./call-lifecycle";
import { composeVoicePrompt } from "./prompt-composer";
import { resolveVoiceProvider, defaultVoiceProviderId } from "./providers/registry";
import { resolveTtsVoiceId } from "@aivoiceos/voice-engine";
import { resolveOpenAiVoice } from "./providers/openai-config";
import { resolveElevenVoiceId } from "./providers/elevenlabs-v3.provider";

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

  private buildPromptBundle(project: {
    id: string;
    name: string;
    businessTemplate: string;
    businessLabel: string | null;
    agent: {
      persona: string;
      prompt: string;
      userPrompt?: string | null;
      greeting?: string | null;
      voiceId: string;
      speechSpeed?: number | null;
      temperature?: number | null;
      maxTokens?: number | null;
    } | null;
  }) {
    const agent = project.agent;
    if (!agent) throw new BadRequestException("Agent konfiqurasiyası yoxdur");
    const businessLabel = this.businessLabelOf(project);
    const operator = resolveOperator(agent.persona);
    const persona = operator.name;
    const gender = operator.gender;
    const companyName = (project.name || businessLabel || "").trim();
    const providerHint = defaultVoiceProviderId();
    const rawVoice = agent.voiceId || operator.voiceId;
    const ttsVoiceId =
      providerHint === "elevenlabs"
        ? resolveElevenVoiceId({ voiceId: rawVoice, gender })
        : providerHint === "openai"
          ? resolveOpenAiVoice({ voiceId: rawVoice, gender })
          : resolveTtsVoiceId({ voiceId: rawVoice, gender });
    const speechSpeed = normalizeSpeechSpeed(agent.speechSpeed);
    const ttsRate = speechSpeedToEdgeRate(speechSpeed);

    // Spoken greeting comes ONLY from agent.greeting or auto company+name template.
    // User Prompt is never used as spoken text.
    let greeting = (agent.greeting || "").trim() || null;
    if (greeting && !greeting.toLowerCase().includes(persona.toLowerCase())) {
      greeting = null;
    }

    const firstMessage = buildCallGreeting({
      persona,
      businessLabel,
      templateId: project.businessTemplate,
      voiceId: ttsVoiceId,
      customGreeting: greeting,
      projectName: project.name,
      companyName,
    });

    const identity = buildIdentityPrompt({
      persona,
      businessLabel,
      templateId: project.businessTemplate,
      voiceId: ttsVoiceId,
      projectName: project.name,
      companyName,
      firstMessage,
    });

    const { fullPrompt, userInstruction } = composeVoicePrompt({
      identityBlock: identity,
      systemPrompt: agent.prompt || "",
      userPrompt: agent.userPrompt || "",
      firstMessage,
      persona,
      companyName,
    });

    return {
      operator,
      persona,
      gender,
      companyName,
      businessLabel,
      ttsVoiceId,
      firstMessage,
      fullPrompt,
      userInstruction,
      speechSpeed,
      ttsRate,
      // Internal LLM knobs (not exposed in admin)
      temperature: agent.temperature ?? 0.35,
      maxTokens: agent.maxTokens ?? 140,
    };
  }

  async createSession(organizationId: string, projectId: string) {
    const project = await this.loadProject(organizationId, projectId);
    this.assertVoiceActive(project);

    // Production default is env VOICE_PROVIDER (elevenlabs v3) — not per-row lock-in
    const provider = resolveVoiceProvider();
    if (!provider.configured()) {
      throw new BadRequestException(
        `Voice provider (${provider.id}) konfiqurasiya olunmayıb. ELEVENLABS_API_KEY yoxlayın.`,
      );
    }

    const agent = project.agent!;
    const bundle = this.buildPromptBundle(project);
    const engineId = defaultVoiceProviderId();

    // Reuse cached ElevenLabs agent id when still on same engine+voice+persona
    const canReuseExternal =
      engineId === "elevenlabs" &&
      Boolean(agent.externalAgentId) &&
      (agent.persona || "").trim() === bundle.persona &&
      agent.voiceProvider === engineId &&
      agent.voiceId === bundle.ttsVoiceId;

    const needsMetaSync =
      (agent.persona || "").trim() !== bundle.persona ||
      agent.voiceProvider !== engineId ||
      agent.voiceId !== bundle.ttsVoiceId;

    if (needsMetaSync && !canReuseExternal) {
      await this.prisma.agent.update({
        where: { projectId },
        data: {
          persona: bundle.persona,
          voiceProvider: engineId,
          voiceId: bundle.ttsVoiceId,
          externalAgentId: null,
        },
      });
    } else if (needsMetaSync) {
      await this.prisma.agent.update({
        where: { projectId },
        data: {
          persona: bundle.persona,
          voiceProvider: engineId,
          voiceId: bundle.ttsVoiceId,
        },
      });
    }

    const session = await provider.issueClientSession({
      projectId: project.id,
      projectName: project.name,
      persona: bundle.persona,
      gender: bundle.gender,
      language: agent.language || "az",
      systemPrompt: bundle.fullPrompt,
      firstMessage: bundle.firstMessage,
      voiceId: bundle.ttsVoiceId,
      voiceProvider: engineId,
      temperature: bundle.temperature,
      maxTokens: bundle.maxTokens,
      cachedExternalId: canReuseExternal ? agent.externalAgentId : null,
    });

    // Persist ElevenLabs agent id for faster subsequent syncs
    if (
      session.externalAgentId &&
      (session.externalAgentId !== agent.externalAgentId || needsMetaSync)
    ) {
      await this.prisma.agent.update({
        where: { projectId },
        data: {
          persona: bundle.persona,
          voiceProvider: engineId,
          voiceId: bundle.ttsVoiceId,
          externalAgentId: session.externalAgentId,
        },
      });
    }

    return {
      provider: session.provider,
      transport: session.transport,
      connectionType: session.transport,
      signedUrl: session.signedUrl,
      token: session.token,
      /** Ephemeral key (OpenAI) or conversation token (ElevenLabs WebRTC fallback) */
      value: session.token,
      client_secret: session.token ? { value: session.token } : undefined,
      agent_id: session.externalAgentId,
      projectId: project.id,
      projectName: project.name,
      businessLabel: bundle.businessLabel,
      companyName: bundle.companyName,
      operatorId: bundle.operator.id,
      operatorName: bundle.persona,
      operatorGender: bundle.gender,
      firstMessage: bundle.firstMessage,
      ttsVoiceId: session.ttsVoiceId,
      speechSpeed: bundle.speechSpeed,
      userPrompt: bundle.userInstruction,
      projectStatus: project.status,
      tools: [...AGENT_TOOL_NAMES],
      engine: session.provider || defaultVoiceProviderId(),
      model: session.model,
      sttModel: session.sttModel,
      expiresAt: session.expiresAt,
    };
  }

  /** Synthesize greeting / arbitrary text (free Edge neural TTS). */
  async speak(
    organizationId: string,
    projectId: string,
    body: { text?: string },
  ) {
    const project = await this.loadProject(organizationId, projectId);
    this.assertVoiceActive(project);
    const bundle = this.buildPromptBundle(project);
    const provider = resolveVoiceProvider();
    const text = String(body?.text || bundle.firstMessage).trim();
    if (!text) throw new BadRequestException("Boş mətn");
    return provider.speak({
      text,
      voiceId: bundle.ttsVoiceId,
      rate: bundle.ttsRate,
    });
  }

  /** One conversation turn: STT text in → LLM + TTS out. */
  async turn(
    organizationId: string,
    projectId: string,
    body: {
      userText?: string;
      history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    },
  ) {
    const project = await this.loadProject(organizationId, projectId);
    this.assertVoiceActive(project);
    const userText = String(body?.userText || "").trim();
    if (!userText) throw new BadRequestException("userText tələb olunur");

    const bundle = this.buildPromptBundle(project);
    const provider = resolveVoiceProvider();
    if (!provider.turn) {
      throw new BadRequestException("Bu voice provider turn dəstəkləmir");
    }

    return provider.turn({
      systemPrompt: bundle.fullPrompt,
      history: body.history || [],
      userText,
      voiceId: bundle.ttsVoiceId,
      temperature: bundle.temperature,
      maxTokens: bundle.maxTokens,
      rate: bundle.ttsRate,
    });
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
