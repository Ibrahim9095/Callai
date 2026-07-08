import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AGENT_INSTRUCTIONS, FIRST_MESSAGE_AZ, REALTIME_TOOLS } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, "..", "data", "elevenlabs-agent.json");

const ELEVEN_API = "https://api.elevenlabs.io/v1";
const ELEVEN_KEY = () => process.env.ELEVENLABS_API_KEY || "";
const VOICE_ID = () => process.env.ELEVENLABS_VOICE_ID || "hpp4J3VqNfWAUOO0d1Us"; // Bella — warm professional
const LLM = () => process.env.ELEVENLABS_LLM || "gemini-2.5-flash";
// eleven_v3_conversational is the only Agents TTS that supports Azerbaijani (az)
const TTS_MODEL = () => process.env.ELEVENLABS_TTS_MODEL || "eleven_v3_conversational";

function headers() {
  return {
    "xi-api-key": ELEVEN_KEY(),
    "Content-Type": "application/json",
  };
}

/** Sanitize JSON Schema for ElevenLabs (no additionalProperties; every prop needs description) */
function sanitizeSchema(node, fallbackName = "value") {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((n, i) => sanitizeSchema(n, `${fallbackName}_${i}`));

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "additionalProperties") continue;
    out[key] = sanitizeSchema(value, key);
  }

  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    for (const [propName, propSchema] of Object.entries(out.properties)) {
      if (propSchema && typeof propSchema === "object" && !propSchema.description) {
        propSchema.description = propName;
      }
      if (propSchema?.type === "array" && propSchema.items && typeof propSchema.items === "object") {
        if (!propSchema.items.description) propSchema.items.description = `${propName} item`;
        if (propSchema.items.properties) {
          for (const [ik, iv] of Object.entries(propSchema.items.properties)) {
            if (iv && typeof iv === "object" && !iv.description) iv.description = ik;
          }
        }
        delete propSchema.items.additionalProperties;
      }
    }
  }

  return out;
}

/** Convert OpenAI-style tools → ElevenLabs client tools (run in browser → our /api/tools) */
export function toElevenClientTools() {
  return REALTIME_TOOLS.map((t) => ({
    type: "client",
    name: t.name,
    description: t.description,
    expects_response: true,
    parameters: sanitizeSchema(t.parameters || { type: "object", properties: {} }),
  }));
}

function buildAgentBody() {
  return {
    name: "CallAI Leyla",
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE_AZ,
        language: "az",
        prompt: {
          prompt: AGENT_INSTRUCTIONS,
          llm: LLM(),
          temperature: 0.75,
          tools: toElevenClientTools(),
        },
      },
      tts: {
        voice_id: VOICE_ID(),
        model_id: TTS_MODEL(),
        expressive_mode: true,
        stability: 0.35,
        similarity_boost: 0.75,
        speed: 0.95,
        optimize_streaming_latency: 2,
        agent_output_audio_format: "pcm_16000",
        suggested_audio_tags: [
          { tag: "warmly", description: "Mehriban salam və təşəkkür" },
          { tag: "friendly", description: "Gündəlik söhbət tonu" },
          { tag: "thinking", description: "Stok/qiymətə baxarkən" },
          { tag: "sighs", description: "Üzr və ya gecikmə" },
          { tag: "excited", description: "Yaxşı təklif və ya uğurlu sifariş" },
        ],
      },
      asr: {
        quality: "high",
        provider: "scribe_realtime",
        user_input_audio_format: "pcm_16000",
        keywords: [
          "CallAI",
          "Leyla",
          "Bakı",
          "manat",
          "sifariş",
          "çatdırılma",
          "iPhone",
          "AirPods",
          "hoodie",
          "nağd",
          "kart",
        ],
      },
      turn: {
        turn_timeout: 7,
        silence_end_call_timeout: -1,
        turn_eagerness: "normal",
        speculative_turn: true,
        turn_model: "turn_v3",
      },
      conversation: {
        text_only: false,
      },
    },
    platform_settings: {
      auth: {
        enable_auth: true,
      },
    },
  };
}

function readCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(data) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function formatError(data) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join(" | ");
  }
  return detail?.message || JSON.stringify(data);
}

/**
 * Create or update the ElevenLabs Conversational agent.
 * Returns agent_id. Cached in data/elevenlabs-agent.json.
 */
export async function ensureElevenAgent({ force = false } = {}) {
  if (!ELEVEN_KEY()) {
    throw new Error("ELEVENLABS_API_KEY təyin edilməyib");
  }

  const cached = readCache();
  const envId = process.env.ELEVENLABS_AGENT_ID;
  const agentId = envId || cached?.agent_id;
  const body = buildAgentBody();

  if (agentId && !force) {
    const patchRes = await fetch(`${ELEVEN_API}/convai/agents/${agentId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (patchRes.ok) {
      await patchRes.json().catch(() => ({}));
      writeCache({
        agent_id: agentId,
        updated_at: new Date().toISOString(),
        voice_id: VOICE_ID(),
        llm: LLM(),
        tts_model: TTS_MODEL(),
        language: "az",
      });
      return { agent_id: agentId, updated: true };
    }
    console.warn("ElevenLabs agent patch failed, creating new:", await patchRes.text());
  }

  const createRes = await fetch(`${ELEVEN_API}/convai/agents/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await createRes.json();
  if (!createRes.ok) {
    throw new Error(formatError(data) || "Agent yaradıla bilmədi");
  }

  const newId = data.agent_id;
  writeCache({
    agent_id: newId,
    created_at: new Date().toISOString(),
    voice_id: VOICE_ID(),
    llm: LLM(),
    tts_model: TTS_MODEL(),
    language: "az",
  });
  return { agent_id: newId, created: true, data };
}

export async function getConversationToken(agentId) {
  if (!ELEVEN_KEY()) throw new Error("ELEVENLABS_API_KEY təyin edilməyib");
  const id = agentId || readCache()?.agent_id || process.env.ELEVENLABS_AGENT_ID;
  if (!id) throw new Error("Agent ID yoxdur — əvvəlcə ensureElevenAgent çağırın");

  const res = await fetch(
    `${ELEVEN_API}/convai/conversation/token?agent_id=${encodeURIComponent(id)}`,
    { headers: { "xi-api-key": ELEVEN_KEY() } }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(formatError(data) || "Conversation token alınmadı");
  }
  return { token: data.token, agent_id: id };
}

export function elevenConfigured() {
  return Boolean(ELEVEN_KEY());
}

export function getElevenStatus() {
  const cache = readCache();
  return {
    configured: elevenConfigured(),
    agent_id: process.env.ELEVENLABS_AGENT_ID || cache?.agent_id || null,
    voice_id: VOICE_ID(),
    llm: LLM(),
    tts_model: TTS_MODEL(),
    language: "az",
  };
}
