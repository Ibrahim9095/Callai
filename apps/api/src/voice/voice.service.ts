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
  normalizeCreateArgs,
  normalizeDeleteArgs,
  normalizeSearchArgs,
  normalizeUpdateArgs,
} from "./tool-args";
import {
  inactiveProjectMessage,
  isProjectVoiceActive,
} from "./call-lifecycle";
import { composeVoicePrompt } from "./prompt-composer";
import { resolveVoiceProvider, defaultVoiceProviderId } from "./providers/registry";
import { getEdgeNeuralProvider } from "./providers/edge-neural.provider";
import { getElevenLabsV3Provider, elevenConfigured, elevenApiKey } from "./providers/elevenlabs-v3.provider";
import {
  elevenLabsQuotaAvailable,
  isQuotaErrorMessage,
  QUOTA_USER_MESSAGE_AZ,
} from "./providers/elevenlabs-quota";
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

  private async buildPromptBundle(
    organizationId: string,
    project: {
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
    },
  ) {
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

    // Inject live sheet catalog so the agent knows every uploaded file/sheet
    let knowledgeCatalog: string | null = null;
    const asrKeywords: string[] = [];
    try {
      const listed = await this.knowledge.agentListCollections(organizationId, project.id);
      if (listed?.collections?.length) {
        knowledgeCatalog = listed.collections
          .map(
            (c: {
              label: string;
              name: string;
              file?: string | null;
              recordCount: number;
              fields: Array<{ key: string; label: string }>;
            }) => {
              const fields = (c.fields || [])
                .slice(0, 12)
                .map((f) => f.label || f.key)
                .join(", ");
              const file = c.file ? ` · fayl: ${c.file}` : "";
              asrKeywords.push(c.label, c.name);
              for (const f of c.fields || []) {
                if (f.label) asrKeywords.push(f.label);
                if (f.key) asrKeywords.push(f.key.replace(/_/g, " "));
              }
              return `- «${c.label}» (${c.name})${file} · ${c.recordCount} sətir · sahələr: ${fields || "—"}`;
            },
          )
          .join("\n");
      }
    } catch {
      knowledgeCatalog = null;
    }

    const { fullPrompt, userInstruction } = composeVoicePrompt({
      identityBlock: identity,
      systemPrompt: agent.prompt || "",
      userPrompt: agent.userPrompt || "",
      firstMessage,
      persona,
      companyName,
      knowledgeCatalog,
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
      temperature: agent.temperature ?? 0.55,
      maxTokens: agent.maxTokens ?? 220,
      asrKeywords: [...new Set(asrKeywords.filter(Boolean))].slice(0, 40),
    };
  }

  async createSession(organizationId: string, projectId: string) {
    const project = await this.loadProject(organizationId, projectId);
    this.assertVoiceActive(project);

    const agent = project.agent!;
    const bundle = await this.buildPromptBundle(organizationId, project);

    let provider = resolveVoiceProvider();
    let fallbackNotice: string | null = null;

    // ElevenLabs Free credits often hit 0 mid-day — auto-fall back so calls keep working
    if (provider.id === "elevenlabs" && elevenConfigured()) {
      const quota = await elevenLabsQuotaAvailable(elevenApiKey());
      if (!quota.ok) {
        console.warn("[voice] ElevenLabs quota exhausted — falling back to edge_neural:", quota.reason);
        provider = getEdgeNeuralProvider();
        fallbackNotice = QUOTA_USER_MESSAGE_AZ;
        // Use Edge Banu/Babek ids (not ElevenLabs Jessica/Mark)
        bundle.ttsVoiceId = resolveTtsVoiceId({
          voiceId: bundle.ttsVoiceId,
          gender: bundle.gender,
        });
      }
    }

    if (!provider.configured()) {
      throw new BadRequestException(
        `Voice provider (${provider.id}) konfiqurasiya olunmayıb.`,
      );
    }

    const engineId = provider.id;

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
      keywords: bundle.asrKeywords,
      cachedExternalId: canReuseExternal ? agent.externalAgentId : null,
    });

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
      engine: session.provider || engineId,
      model: session.model || (engineId === "edge_neural" ? "edge-banu" : undefined),
      sttModel: session.sttModel || (engineId === "edge_neural" ? "web-speech-az" : undefined),
      expiresAt: session.expiresAt,
      fallbackNotice,
      warning: fallbackNotice,
    };
  }

  /** Synthesize greeting / arbitrary text — Edge fallback if ElevenLabs quota is dead. */
  async speak(
    organizationId: string,
    projectId: string,
    body: { text?: string },
  ) {
    const project = await this.loadProject(organizationId, projectId);
    this.assertVoiceActive(project);
    const bundle = await this.buildPromptBundle(organizationId, project);
    const text = String(body?.text || bundle.firstMessage).trim();
    if (!text) throw new BadRequestException("Boş mətn");

    let provider = resolveVoiceProvider();
    // Prefer Edge for speak when ElevenLabs is the configured provider but out of credits
    if (provider.id === "elevenlabs") {
      try {
        return await getElevenLabsV3Provider().speak({
          text,
          voiceId: bundle.ttsVoiceId,
          rate: bundle.ttsRate,
        });
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (isQuotaErrorMessage(msg)) {
          console.warn("[voice.speak] ElevenLabs quota — Edge fallback");
          provider = getEdgeNeuralProvider();
        } else {
          throw e;
        }
      }
    }

    return provider.speak({
      text,
      voiceId: bundle.ttsVoiceId,
      rate: bundle.ttsRate,
    });
  }

  /** One conversation turn: STT text in → LLM + TTS out (Edge path + tools). */
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

    const bundle = await this.buildPromptBundle(organizationId, project);
    // Always use Edge for turn pipeline (ElevenLabs Agents don't use this endpoint)
    const provider = getEdgeNeuralProvider();
    if (!provider.turn) {
      throw new BadRequestException("Bu voice provider turn dəstəkləmir");
    }

    // Tool-aware turn: let LLM call search/create when needed
    return this.turnWithTools(organizationId, projectId, {
      systemPrompt: bundle.fullPrompt,
      history: body.history || [],
      userText,
      voiceId: bundle.ttsVoiceId,
      temperature: bundle.temperature,
      maxTokens: bundle.maxTokens,
      rate: bundle.ttsRate,
    });
  }

  /**
   * Edge pipeline turn with OpenAI function-calling so rezerv/search still work
   * when ElevenLabs Agents are unavailable (quota).
   */
  private async turnWithTools(
    organizationId: string,
    projectId: string,
    req: {
      systemPrompt: string;
      history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
      userText: string;
      voiceId?: string;
      temperature?: number;
      maxTokens?: number;
      rate?: string;
    },
  ) {
    const openaiKey = process.env.OPENAI_API_KEY || "";
    if (!openaiKey) {
      throw new BadRequestException(
        "Dialoq üçün OPENAI_API_KEY lazımdır (ElevenLabs kredit bitib — ehtiyat rejim).",
      );
    }

    const { AGENT_TOOLS } = await import("./agent-tools");
    const openAiTools = AGENT_TOOLS.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: "object", properties: {} },
      },
    }));

    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: req.systemPrompt },
      ...req.history
        .filter((h) => h.role === "user" || h.role === "assistant")
        .slice(-12)
        .map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: req.userText },
    ];

    const model = process.env.VOICE_LLM_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
    const maxTokens = req.maxTokens && req.maxTokens > 0 ? Math.min(req.maxTokens, 280) : 180;
    const temperature =
      typeof req.temperature === "number" ? Math.min(1, Math.max(0, req.temperature)) : 0.4;

    let replyText = "";
    // Up to 3 tool rounds
    for (let round = 0; round < 3; round++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages,
          tools: openAiTools,
          tool_choice: "auto",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new BadRequestException(data?.error?.message || `LLM xətası (${res.status})`);
      }
      const msg = data?.choices?.[0]?.message;
      if (!msg) throw new BadRequestException("LLM boş cavab qaytardı");

      const toolCalls = msg.tool_calls as
        | Array<{ id: string; function: { name: string; arguments: string } }>
        | undefined;

      if (toolCalls?.length) {
        messages.push(msg);
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }
          const result = await this.runTool(organizationId, projectId, tc.function.name, args);
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          });
        }
        continue;
      }

      replyText = String(msg.content || "")
        .trim()
        .replace(/\s+/g, " ");

      // If model only said the filler without tools, force a search then answer
      const fillerOnly =
        !toolCalls?.length &&
        /bir saniy[eə]|zəhmət olmasa|yoxlayıram/i.test(replyText) &&
        replyText.length < 80;
      if (fillerOnly && round < 2) {
        messages.push(msg);
        messages.push({
          role: "user",
          content:
            "İndi search_records alətini çağır (query: istifadəçinin sualı) və nəticəyə əsasən qısa cavab ver. Yalnız filler demə.",
        });
        continue;
      }
      break;
    }

    if (!replyText || /^bir saniy/i.test(replyText)) {
      // Last-resort: search ourselves then ask LLM to speak from results
      const search = await this.knowledge.agentSearch(organizationId, projectId, {
        query: req.userText,
        limit: 10,
      });
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: req.systemPrompt },
            {
              role: "user",
              content: `Müştəri sualı: ${req.userText}\n\nCədvəl nəticəsi (JSON):\n${JSON.stringify(search).slice(0, 3500)}\n\nBuna əsasən qısa Azərbaycan cavabı ver. Uydurma demə.`,
            },
          ],
        }),
      });
      const data = await res.json();
      replyText = String(data?.choices?.[0]?.message?.content || "")
        .trim()
        .replace(/\s+/g, " ");
    }

    if (!replyText) {
      replyText = "Bir saniyə, zəhmət olmasa. Yenidən deyə bilərsiniz?";
    }

    const spoken = await getEdgeNeuralProvider().speak({
      text: replyText,
      voiceId: req.voiceId,
      rate: req.rate || "+15%",
    });

    return {
      replyText,
      audioBase64: spoken.audioBase64,
      mimeType: spoken.mimeType,
      provider: "edge_neural",
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

    if (!AGENT_TOOL_NAMES.includes(name as AgentToolName)) {
      throw new NotFoundException(`Alət tapılmadı: ${name}`);
    }

    // Log raw tool args so we can diagnose ElevenLabs payload shapes
    try {
      console.log(
        `[voice.tool] ${name}`,
        JSON.stringify(rawArgs).slice(0, 800),
      );
    } catch {
      /* ignore */
    }

    switch (name as AgentToolName) {
      case "list_collections":
        return this.knowledge.agentListCollections(organizationId, projectId);
      case "search_records": {
        const s = normalizeSearchArgs(rawArgs);
        return this.knowledge.agentSearch(organizationId, projectId, s);
      }
      case "create_record": {
        const c = normalizeCreateArgs(rawArgs);
        const result = await this.knowledge.agentCreateRecord(organizationId, projectId, c);
        console.log(`[voice.tool] create_record →`, JSON.stringify(result).slice(0, 500));
        return result;
      }
      case "update_record": {
        const u = normalizeUpdateArgs(rawArgs);
        return this.knowledge.agentUpdateRecord(organizationId, projectId, u);
      }
      case "delete_record": {
        const d = normalizeDeleteArgs(rawArgs);
        return this.knowledge.agentDeleteRecord(organizationId, projectId, d);
      }
      default:
        throw new NotFoundException(`Alət tapılmadı: ${name}`);
    }
  }
}
