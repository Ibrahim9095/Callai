/**
 * ElevenLabs Conversational AI adapter — per-project agent sync + session token.
 * Goals: fluent AZ, correct persona name + gender voice, never auto-hangup, low latency.
 */

import { resolveElevenLabsVoiceId } from "@aivoiceos/shared";
import { AGENT_TOOLS } from "./agent-tools";
import { AZ_PREMIUM_STYLE, VOICE_RUNTIME_RULES } from "./prompt-style";

const ELEVEN_API = "https://api.elevenlabs.io/v1";

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
  /** Catalog voice id from admin panel */
  catalogVoiceId?: string | null;
  voiceProvider?: string | null;
  gender?: "female" | "male" | "unknown";
}

function buildAgentBody(spec: ProjectAgentSpec) {
  const llm = process.env.ELEVENLABS_LLM || "gemini-2.5-flash";
  const ttsModel = process.env.ELEVENLABS_TTS_MODEL || "eleven_v3_conversational";
  const voiceId = resolveElevenLabsVoiceId({
    voiceProvider: spec.voiceProvider,
    voiceId: spec.catalogVoiceId,
    gender: spec.gender,
  });

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

  return {
    name: `AI Voice OS — ${spec.projectName} — ${spec.persona}`.slice(0, 80),
    conversation_config: {
      agent: {
        first_message: spec.firstMessage,
        language: "az",
        disable_first_message_interruptions: true,
        prompt: {
          prompt: spec.prompt,
          llm,
          temperature: 0.4,
          // Explicitly do not send built_in_tools.end_call
          tools: toElevenClientTools(),
        },
      },
      tts: {
        voice_id: voiceId,
        model_id: ttsModel,
        expressive_mode: true,
        // Slightly more stable = clearer AZ on 2nd+ calls
        stability: 0.55,
        similarity_boost: 0.75,
        speed: 0.98,
        optimize_streaming_latency: 3,
        agent_output_audio_format: "pcm_16000",
      },
      asr: {
        quality: "high",
        provider: "scribe_realtime",
        user_input_audio_format: "pcm_16000",
        keywords,
      },
      turn: {
        // Patient listening — never cut the caller; never auto-end after greeting.
        turn_timeout: 20,
        silence_end_call_timeout: -1,
        turn_eagerness: "patient",
        speculative_turn: true,
        turn_model: "turn_v3",
        spelling_patience: "auto",
        soft_timeout_config: {
          // ElevenLabs soft timeout must stay ≤ 8s
          timeout_seconds: 7.5,
          message: "Buyurun, sizi dinləyirəm.",
          max_soft_timeouts_per_generation: 2,
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

  // When forceRecreate: create a brand-new agent so first_message / voice / name
  // cannot stay stale from a previous call (critical after manual rename).
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

export { AZ_PREMIUM_STYLE, VOICE_RUNTIME_RULES };
