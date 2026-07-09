/**
 * ElevenLabs v3 Conversational Voice Provider — production default for AI Voice OS.
 *
 * Why ElevenLabs v3 (not OpenAI) for Azerbaijani:
 * - `eleven_v3_conversational` officially supports `az` with expressive delivery
 * - Native-sounding Bakı dialect when prompted + pronunciation dictionaries
 * - Low-latency Agents WebSocket (avoids LiveKit DataChannel drop after greeting)
 *
 * All model / voice IDs are env-driven.
 */

import type {
  SpeakRequest,
  SpeakResult,
  TurnRequest,
  TurnResult,
  VoiceAgentSpec,
  VoiceProvider,
  VoiceSessionCredentials,
} from "@aivoiceos/voice-engine";
import { AGENT_TOOLS } from "../agent-tools";
import {
  SILENCE_REPROMPT_AZ,
  TTS_CALL_CENTER,
  TURN_CALL_CENTER,
} from "../call-lifecycle";

const ELEVEN_API = "https://api.elevenlabs.io/v1";

/** Explicitly disable every system tool that can terminate or divert a call. */
const DISABLED_BUILT_IN_TOOLS: Record<string, null> = {
  end_call: null,
  language_detection: null,
  transfer_to_agent: null,
  transfer_to_number: null,
  skip_turn: null,
  play_keypad_touch_tone: null,
  voicemail_detection: null,
  update_state: null,
  memory_entry_search: null,
  memory_entry_create: null,
  memory_entry_update: null,
  memory_entry_delete: null,
  agent_prompt_change: null,
  procedure_update: null,
  procedure_create: null,
  procedure_delete: null,
  transfer_to_genesys_chat: null,
  run_subagent: null,
};

export function elevenApiKey(): string {
  return (process.env.ELEVENLABS_API_KEY || "").trim();
}

export function elevenConfigured(): boolean {
  return Boolean(elevenApiKey());
}

export function elevenTtsModel(): string {
  return (process.env.ELEVENLABS_TTS_MODEL || "eleven_v3_conversational").trim();
}

export function elevenLlm(): string {
  return (process.env.ELEVENLABS_LLM || "gemini-2.5-flash").trim();
}

/** Jessica — bright warm conversational (Leyla / Bakı phone). Override via env. */
export function elevenVoiceFemale(): string {
  return (
    process.env.ELEVENLABS_VOICE_ID ||
    process.env.ELEVENLABS_VOICE_ID_FEMALE ||
    "cgSgspJ2msm6clMCkdW9"
  ).trim();
}

/** Mark — natural conversational male (Samir). Override via env. */
export function elevenVoiceMale(): string {
  return (process.env.ELEVENLABS_VOICE_ID_MALE || "UgBBYS2sOqTuMpoF3BR0").trim();
}

/** Legacy / other-account voice ids that must be remapped on this workspace. */
const LEGACY_VOICE_REMAP: Record<string, "female" | "male"> = {
  // Fili — not available on current ElevenLabs account
  FDs1ZX5J4e4f2c2erxtW: "female",
  // Previous Bella default on this account — remap to Jessica conversational
  hpp4J3VqNfWAUOO0d1Us: "female",
  // Previous Chris default — remap to Mark natural conversations
  iP95p4xoKVk53GoZ742B: "male",
};

export function resolveElevenVoiceId(opts: {
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | null;
}): string {
  const v = (opts.voiceId || "").trim();
  const female = elevenVoiceFemale();
  const male = elevenVoiceMale();

  // Remap voices that belong to another ElevenLabs account / plan
  const legacy = LEGACY_VOICE_REMAP[v];
  if (legacy === "male") return male;
  if (legacy === "female") return female;

  // Already a current catalog / env voice
  if (v === female || v === male) return v;

  // Other ElevenLabs voice ids (20+ alnum) — keep as-is
  if (/^[a-zA-Z0-9]{20,}$/.test(v) && !LEGACY_VOICE_REMAP[v]) return v;

  const lower = v.toLowerCase();
  if (
    lower.includes("babek") ||
    lower.includes("cedar") ||
    lower.includes("male") ||
    lower.includes("samir") ||
    opts.gender === "male"
  ) {
    return male;
  }
  return female;
}

function pronunciationDicts(): Array<{ pronunciation_dictionary_id: string; version_id: string }> {
  const raw = process.env.ELEVENLABS_PRONUNCIATION_DICTS;
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[elevenlabs] ELEVENLABS_PRONUNCIATION_DICTS JSON parse failed — ignoring");
    return [];
  }
}

function headers() {
  return {
    "xi-api-key": elevenApiKey(),
    "Content-Type": "application/json",
  };
}

function sanitizeSchema(node: any, fallbackName = "value"): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((n, i) => sanitizeSchema(n, `${fallbackName}_${i}`));

  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "additionalProperties") continue;
    out[key] = sanitizeSchema(value, key);
  }

  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    for (const [propName, propSchema] of Object.entries(out.properties) as [string, any][]) {
      if (propSchema && typeof propSchema === "object" && !propSchema.description) {
        propSchema.description = propName;
      }
      if (propSchema?.type === "array" && propSchema.items && typeof propSchema.items === "object") {
        if (!propSchema.items.description) propSchema.items.description = `${propName} item`;
        if (propSchema.items.properties) {
          for (const [ik, iv] of Object.entries(propSchema.items.properties) as [string, any][]) {
            if (iv && typeof iv === "object" && !iv.description) iv.description = ik;
          }
        }
        delete propSchema.items.additionalProperties;
      }
    }
  }
  return out;
}

function toElevenClientTools() {
  return AGENT_TOOLS.map((t) => ({
    type: "client",
    name: t.name,
    description: t.description,
    expects_response: true,
    parameters: sanitizeSchema(t.parameters || { type: "object", properties: {} }),
  }));
}

function formatError(data: any): string {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => `${(d.loc || []).join(".")}: ${d.msg}`).join(" | ");
  }
  return detail?.message || JSON.stringify(data);
}

function buildAgentBody(spec: VoiceAgentSpec) {
  const voiceId = resolveElevenVoiceId({
    voiceId: spec.voiceId,
    gender: spec.gender,
  });
  const temperature =
    typeof spec.temperature === "number" && !Number.isNaN(spec.temperature)
      ? Math.min(1, Math.max(0, spec.temperature))
      : 0.45;

  const keywords = Array.from(
    new Set(
      [
        ...(spec.keywords || []),
        spec.persona,
        spec.projectName,
        "Bakı",
        "Azərbaycan",
        "manat",
        "sifariş",
        "rezerv",
        "rezervasiya",
        "buyurun",
        "əlbəttə",
        "xahiş",
        "bir saniyə",
        "necəsiz",
        "bilərəm",
        "qol saatı",
        "həkim",
        "klinika",
        "müştəri",
        "gözəllik",
        "otel",
        "otaq",
        "qiymət",
        "endirim",
        "zəhmət olmasa",
        "sağ olun",
        "təşəkkür",
        "aydındır",
        "başa düşdüm",
        "narahat olmayın",
      ].filter(Boolean),
    ),
  ).slice(0, 50);

  const promptBlock: Record<string, unknown> = {
    prompt: spec.systemPrompt,
    llm: elevenLlm(),
    temperature,
    built_in_tools: { ...DISABLED_BUILT_IN_TOOLS },
    tools: toElevenClientTools(),
  };
  if (spec.maxTokens != null && spec.maxTokens > 0) {
    promptBlock.max_tokens = spec.maxTokens;
  }

  const speedRaw = Number(process.env.ELEVENLABS_TTS_SPEED || String(TTS_CALL_CENTER.speed));
  const speed = Number.isFinite(speedRaw) ? Math.min(1.2, Math.max(0.7, speedRaw)) : TTS_CALL_CENTER.speed;
  const dicts = pronunciationDicts();

  const tts: Record<string, unknown> = {
    voice_id: voiceId,
    model_id: elevenTtsModel(),
    expressive_mode: true,
    stability: TTS_CALL_CENTER.stability,
    similarity_boost: TTS_CALL_CENTER.similarity_boost,
    speed,
    optimize_streaming_latency: TTS_CALL_CENTER.optimize_streaming_latency,
    agent_output_audio_format: "pcm_16000",
    suggested_audio_tags: [
      { tag: "warmly", description: "Mehriban Bakı salamı, təşəkkür" },
      { tag: "friendly", description: "Səmimi söhbət və məsləhət" },
      { tag: "laughs", description: "Yumşaq gülüş — yalnız yerində" },
      { tag: "chuckles", description: "Yüngül təbəssüm" },
      { tag: "thinking", description: "Məlumata baxarkən" },
      { tag: "confident", description: "Tövsiyə və təsdiq" },
      { tag: "sighs", description: "Empatiya / üzr" },
    ],
  };
  if (dicts.length > 0) {
    tts.pronunciation_dictionary_locators = dicts;
  }

  return {
    name: `AI Voice OS — ${spec.projectName} — ${spec.persona}`.slice(0, 80),
    conversation_config: {
      agent: {
        first_message: spec.firstMessage,
        language: "az",
        disable_first_message_interruptions: false,
        prompt: promptBlock,
      },
      tts,
      asr: {
        quality: "high",
        provider: "scribe_realtime",
        user_input_audio_format: "pcm_16000",
        keywords,
      },
      turn: {
        turn_timeout: TURN_CALL_CENTER.turn_timeout,
        silence_end_call_timeout: TURN_CALL_CENTER.silence_end_call_timeout,
        turn_eagerness: TURN_CALL_CENTER.turn_eagerness,
        speculative_turn: TURN_CALL_CENTER.speculative_turn,
        turn_model: TURN_CALL_CENTER.turn_model,
        spelling_patience: "auto",
        soft_timeout_config: {
          timeout_seconds: TURN_CALL_CENTER.soft_timeout_seconds,
          message: SILENCE_REPROMPT_AZ,
          max_soft_timeouts_per_generation: TURN_CALL_CENTER.max_soft_timeouts_per_generation,
        },
      },
      conversation: {
        text_only: false,
        max_duration_seconds: 3600,
      },
    },
    platform_settings: {
      auth: { enable_auth: true },
    },
  };
}

export class ElevenLabsV3VoiceProvider implements VoiceProvider {
  readonly id = "elevenlabs" as const;

  configured(): boolean {
    return elevenConfigured();
  }

  async createOrSyncAgent(spec: VoiceAgentSpec) {
    if (!this.configured()) throw new Error("ELEVENLABS_API_KEY təyin edilməyib");
    const body = buildAgentBody(spec);

    if (spec.cachedExternalId) {
      const agentId = spec.cachedExternalId;
      const patchRes = await fetch(`${ELEVEN_API}/convai/agents/${agentId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (patchRes.ok) {
        await patchRes.json().catch(() => ({}));
        return { externalId: agentId, recreated: false };
      }
      const errText = await patchRes.text().catch(() => "");
      console.warn("[elevenlabs] agent patch failed, recreating:", errText.slice(0, 300));
    }

    const createRes = await fetch(`${ELEVEN_API}/convai/agents/create`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const data = (await createRes.json()) as Record<string, any>;
    if (!createRes.ok) {
      throw new Error(formatError(data) || "ElevenLabs agent yaradıla bilmədi");
    }
    return { externalId: String(data.agent_id), recreated: true };
  }

  async issueClientSession(spec: VoiceAgentSpec): Promise<VoiceSessionCredentials> {
    if (!this.configured()) throw new Error("ELEVENLABS_API_KEY təyin edilməyib");

    const synced = await this.createOrSyncAgent(spec);
    const agentId = synced.externalId!;
    const voiceId = resolveElevenVoiceId({
      voiceId: spec.voiceId,
      gender: spec.gender,
    });

    // Prefer signed WebSocket URL — avoids LiveKit DataChannel drop after greeting
    const urlRes = await fetch(
      `${ELEVEN_API}/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": elevenApiKey() } },
    );
    const urlData = (await urlRes.json()) as Record<string, any>;
    if (!urlRes.ok || !urlData.signed_url) {
      // Fallback: conversation token (WebRTC)
      const tokRes = await fetch(
        `${ELEVEN_API}/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { "xi-api-key": elevenApiKey() } },
      );
      const tokData = (await tokRes.json()) as Record<string, any>;
      if (!tokRes.ok || !tokData.token) {
        throw new Error(formatError(urlData) || formatError(tokData) || "ElevenLabs session alınmadı");
      }
      return {
        provider: this.id,
        transport: "webrtc",
        token: String(tokData.token),
        externalAgentId: agentId,
        firstMessage: spec.firstMessage,
        ttsVoiceId: voiceId,
        operatorName: spec.persona,
        operatorGender: spec.gender,
        model: elevenTtsModel(),
        sttModel: "scribe_realtime",
      };
    }

    return {
      provider: this.id,
      transport: "websocket",
      signedUrl: String(urlData.signed_url),
      externalAgentId: agentId,
      firstMessage: spec.firstMessage,
      ttsVoiceId: voiceId,
      operatorName: spec.persona,
      operatorGender: spec.gender,
      model: elevenTtsModel(),
      sttModel: "scribe_realtime",
    };
  }

  /** Standalone ElevenLabs TTS (preview / non-agent path). */
  async speak(req: SpeakRequest): Promise<SpeakResult> {
    if (!this.configured()) throw new Error("ELEVENLABS_API_KEY təyin edilməyib");
    const text = String(req.text || "").trim();
    if (!text) {
      return { audioBase64: "", mimeType: "audio/mpeg", provider: this.id };
    }
    const voiceId = resolveElevenVoiceId({ voiceId: req.voiceId });
    // Use multilingual v2 for one-shot speak (v3 conversational is agent-only)
    const model = (process.env.ELEVENLABS_SPEAK_MODEL || "eleven_multilingual_v2").trim();
    const res = await fetch(`${ELEVEN_API}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: TTS_CALL_CENTER.stability,
          similarity_boost: TTS_CALL_CENTER.similarity_boost,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatError(err) || `ElevenLabs TTS xətası (${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      audioBase64: buf.toString("base64"),
      mimeType: "audio/mpeg",
      provider: this.id,
    };
  }

  /** Text turn not used on ElevenLabs Agents path. */
  async turn(_req: TurnRequest): Promise<TurnResult> {
    throw new Error("ElevenLabs v3 live calls use Agents WebSocket — turn API lazım deyil");
  }
}

let singleton: ElevenLabsV3VoiceProvider | null = null;
export function getElevenLabsV3Provider() {
  if (!singleton) singleton = new ElevenLabsV3VoiceProvider();
  return singleton;
}
