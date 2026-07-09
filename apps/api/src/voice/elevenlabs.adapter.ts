/**
 * ElevenLabs Conversational AI adapter — per-project agent sync + session token.
 *
 * Production invariants:
 * - built_in_tools.end_call explicitly null (never agent-hangup after greeting)
 * - silence_end_call_timeout: -1
 * - natural call-center TTS pace
 */

import { resolveElevenLabsVoiceId } from "@aivoiceos/shared";
import { AGENT_TOOLS } from "./agent-tools";
import { AZ_PREMIUM_STYLE, VOICE_RUNTIME_RULES } from "./prompt-style";
import { SILENCE_REPROMPT_AZ, TTS_CALL_CENTER, TURN_CALL_CENTER } from "./call-lifecycle";

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

function elevenKey() {
  return process.env.ELEVENLABS_API_KEY || "";
}

export function elevenConfigured() {
  return Boolean(elevenKey());
}

function headers() {
  return {
    "xi-api-key": elevenKey(),
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

export interface ProjectAgentSpec {
  projectId: string;
  projectName: string;
  persona: string;
  prompt: string;
  firstMessage: string;
  language: string;
  keywords?: string[];
  cachedAgentId?: string | null;
  forceRecreate?: boolean;
  catalogVoiceId?: string | null;
  voiceProvider?: string | null;
  gender?: "female" | "male" | "unknown";
  temperature?: number;
  maxTokens?: number | null;
}

function buildAgentBody(spec: ProjectAgentSpec) {
  const llm = process.env.ELEVENLABS_LLM || "gemini-2.5-flash";
  const ttsModel = process.env.ELEVENLABS_TTS_MODEL || "eleven_v3_conversational";
  const voiceId = resolveElevenLabsVoiceId({
    voiceProvider: spec.voiceProvider,
    voiceId: spec.catalogVoiceId,
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
        "Bakı",
        "manat",
        "sifariş",
        "rezerv",
        "buyurun",
        "əlbəttə",
        "xahiş",
        "bir saniyə",
      ].filter(Boolean),
    ),
  ).slice(0, 30);

  const promptBlock: Record<string, unknown> = {
    prompt: spec.prompt,
    llm,
    temperature,
    // CRITICAL: null = permanently disabled (PATCH merge cannot re-enable)
    built_in_tools: { ...DISABLED_BUILT_IN_TOOLS },
    tools: toElevenClientTools(),
  };
  if (spec.maxTokens != null && spec.maxTokens > 0) {
    promptBlock.max_tokens = spec.maxTokens;
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
      tts: {
        voice_id: voiceId,
        model_id: ttsModel,
        expressive_mode: true,
        stability: TTS_CALL_CENTER.stability,
        similarity_boost: TTS_CALL_CENTER.similarity_boost,
        speed: TTS_CALL_CENTER.speed,
        optimize_streaming_latency: TTS_CALL_CENTER.optimize_streaming_latency,
        agent_output_audio_format: "pcm_16000",
      },
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

export async function ensureProjectElevenAgent(
  spec: ProjectAgentSpec,
): Promise<{ agent_id: string; recreated: boolean }> {
  if (!elevenKey()) throw new Error("ELEVENLABS_API_KEY təyin edilməyib");

  const body = buildAgentBody(spec);

  // Prefer PATCH so built_in_tools.end_call:null is applied to cached agents.
  // Recreate only when forced or patch fails.
  if (!spec.forceRecreate && spec.cachedAgentId) {
    const agentId = spec.cachedAgentId;
    const patchRes = await fetch(`${ELEVEN_API}/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (patchRes.ok) {
      await patchRes.json().catch(() => ({}));
      return { agent_id: agentId, recreated: false };
    }
    const errText = await patchRes.text().catch(() => "");
    console.warn("ElevenLabs agent patch failed, recreating:", errText.slice(0, 300));
  }

  const createRes = await fetch(`${ELEVEN_API}/convai/agents/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await createRes.json();
  if (!createRes.ok) {
    throw new Error(formatError(data) || "ElevenLabs agent yaradıla bilmədi");
  }
  return { agent_id: data.agent_id as string, recreated: true };
}

export async function getElevenConversationToken(agentId: string): Promise<{ token: string }> {
  if (!elevenKey()) throw new Error("ELEVENLABS_API_KEY təyin edilməyib");
  const res = await fetch(
    `${ELEVEN_API}/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": elevenKey() } },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(formatError(data) || "Conversation token alınmadı");
  return { token: data.token as string };
}

/**
 * Signed WebSocket URL for Conversational AI.
 * Prefer this over LiveKit WebRTC: agent leave after greeting tears down
 * LiveKit PeerConnection → "Unknown DataChannel error on reliable/lossy".
 * WebSocket keeps the session open for the full conversation loop.
 */
export async function getElevenSignedUrl(agentId: string): Promise<{ signedUrl: string }> {
  if (!elevenKey()) throw new Error("ELEVENLABS_API_KEY təyin edilməyib");
  const res = await fetch(
    `${ELEVEN_API}/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": elevenKey() } },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(formatError(data) || "Signed URL alınmadı");
  if (!data.signed_url) throw new Error("Signed URL boş qayıtdı");
  return { signedUrl: data.signed_url as string };
}

export { AZ_PREMIUM_STYLE, VOICE_RUNTIME_RULES };
