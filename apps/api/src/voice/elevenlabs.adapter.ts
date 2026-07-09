/**
 * ElevenLabs Conversational AI adapter — per-project agent sync + session token.
 * Tuned for low WebRTC latency and careful turn-taking.
 */

import { AGENT_TOOLS, VOICE_RUNTIME_RULES } from "./agent-tools";

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
  /** Fully built first message (intro + buyurun…) */
  firstMessage: string;
  language: string;
  cachedAgentId?: string | null;
}

function buildAgentBody(spec: ProjectAgentSpec) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "FDs1ZX5J4e4f2c2erxtW";
  const llm = process.env.ELEVENLABS_LLM || "gemini-2.5-flash";
  const ttsModel = process.env.ELEVENLABS_TTS_MODEL || "eleven_v3_conversational";

  const prompt = `${spec.prompt}\n\n${VOICE_RUNTIME_RULES}`.trim();

  return {
    name: `AI Voice OS — ${spec.projectName}`.slice(0, 80),
    conversation_config: {
      agent: {
        first_message: spec.firstMessage,
        language: spec.language || "az",
        prompt: {
          prompt,
          llm,
          temperature: 0.55,
          tools: toElevenClientTools(),
        },
      },
      tts: {
        voice_id: voiceId,
        model_id: ttsModel,
        expressive_mode: true,
        stability: 0.4,
        similarity_boost: 0.72,
        speed: 1.02,
        // Lowest streaming latency for WebRTC
        optimize_streaming_latency: 4,
        agent_output_audio_format: "pcm_16000",
      },
      asr: {
        quality: "high",
        provider: "scribe_realtime",
        user_input_audio_format: "pcm_16000",
      },
      turn: {
        // Faster turn-taking: less silence before agent responds
        turn_timeout: 6,
        silence_end_call_timeout: -1,
        turn_eagerness: "eager",
        speculative_turn: true,
        turn_model: "turn_v3",
      },
      conversation: { text_only: false },
    },
    platform_settings: {
      auth: { enable_auth: true },
    },
  };
}

export async function ensureProjectElevenAgent(spec: ProjectAgentSpec): Promise<{ agent_id: string }> {
  if (!elevenKey()) throw new Error("ELEVENLABS_API_KEY təyin edilməyib");

  const body = buildAgentBody(spec);
  const agentId = spec.cachedAgentId || undefined;

  if (agentId) {
    const patchRes = await fetch(`${ELEVEN_API}/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (patchRes.ok) {
      await patchRes.json().catch(() => ({}));
      return { agent_id: agentId };
    }
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
  return { agent_id: data.agent_id as string };
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
