import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { AGENT_INSTRUCTIONS, REALTIME_TOOLS } from "./agent.js";
import { toolHandlers, getStoreInfo, searchProducts, getOrderStatus } from "./store.js";
import {
  ensureElevenAgent,
  getConversationToken,
  elevenConfigured,
  getElevenStatus,
} from "./elevenlabs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
const VOICE = process.env.AGENT_VOICE || "marin";

/**
 * Provider selection:
 * - VOICE_PROVIDER=elevenlabs|openai|auto (default auto)
 * - auto → ElevenLabs if key present, else OpenAI
 */
function resolveProvider() {
  const pref = (process.env.VOICE_PROVIDER || "auto").toLowerCase();
  if (pref === "elevenlabs") return elevenConfigured() ? "elevenlabs" : null;
  if (pref === "openai") return OPENAI_API_KEY ? "openai" : null;
  if (elevenConfigured()) return "elevenlabs";
  if (OPENAI_API_KEY) return "openai";
  return null;
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function buildOpenAISessionConfig() {
  return {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: AGENT_INSTRUCTIONS,
    output_modalities: ["audio"],
    tools: REALTIME_TOOLS,
    tool_choice: "auto",
    audio: {
      input: {
        transcription: {
          model: "gpt-4o-mini-transcribe",
          language: "az",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 250,
          silence_duration_ms: 450,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        voice: VOICE,
      },
    },
  };
}

app.get("/api/health", (_req, res) => {
  const provider = resolveProvider();
  res.json({
    ok: true,
    provider,
    hasApiKey: Boolean(OPENAI_API_KEY),
    hasElevenLabs: elevenConfigured(),
    model: provider === "elevenlabs" ? getElevenStatus().llm : REALTIME_MODEL,
    voice: provider === "elevenlabs" ? getElevenStatus().voice_id : VOICE,
    eleven: getElevenStatus(),
    store: getStoreInfo().name,
  });
});

app.get("/api/store", (_req, res) => {
  res.json(getStoreInfo());
});

app.get("/api/products", (req, res) => {
  res.json(
    searchProducts({
      query: req.query.q || "",
      category: req.query.category || "",
      maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
    })
  );
});

app.get("/api/orders/:id", (req, res) => {
  res.json(getOrderStatus({ orderId: req.params.id, phone: req.query.phone }));
});

/**
 * Unified session endpoint — returns provider-specific credentials.
 */
app.post("/api/realtime/session", async (_req, res) => {
  const provider = resolveProvider();
  if (!provider) {
    return res.status(500).json({
      error:
        "Heç bir səs API açarı yoxdur. ELEVENLABS_API_KEY (tövsiyə) və ya OPENAI_API_KEY əlavə edin.",
    });
  }

  try {
    if (provider === "elevenlabs") {
      const { agent_id } = await ensureElevenAgent();
      const { token } = await getConversationToken(agent_id);
      return res.json({
        provider: "elevenlabs",
        token,
        agent_id,
        model: getElevenStatus().llm,
        voice: getElevenStatus().voice_id,
      });
    }

    // OpenAI Realtime GA
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "callai-store-operator",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: buildOpenAISessionConfig(),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Realtime client_secrets error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "Realtime session yaradıla bilmədi",
        details: data,
      });
    }

    res.json({
      provider: "openai",
      value: data.value,
      client_secret: { value: data.value },
      model: data.session?.model || REALTIME_MODEL,
      voice: data.session?.audio?.output?.voice || VOICE,
      expires_at: data.expires_at,
      session: data.session,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Session yaradılarkən xəta baş verdi", message: String(err.message || err) });
  }
});

/** Force recreate / sync ElevenLabs agent */
app.post("/api/elevenlabs/sync", async (_req, res) => {
  if (!elevenConfigured()) {
    return res.status(400).json({ error: "ELEVENLABS_API_KEY yoxdur" });
  }
  try {
    const result = await ensureElevenAgent({ force: true });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

/** Execute store/operator tools */
app.post("/api/tools/:name", (req, res) => {
  const handler = toolHandlers[req.params.name];
  if (!handler) {
    return res.status(404).json({ error: `Alət tapılmadı: ${req.params.name}` });
  }
  try {
    // ElevenLabs webhooks wrap params; client tools send flat body
    const raw = req.body || {};
    const args = raw.parameters && typeof raw.parameters === "object" ? raw.parameters : raw;
    const result = handler(args);
    // Also support ElevenLabs webhook response shape if needed later
    if (req.query.format === "eleven") {
      return res.json({ result });
    }
    res.json(result);
  } catch (err) {
    console.error(`Tool ${req.params.name} failed:`, err);
    res.status(500).json({ error: err.message || "Alət xətası" });
  }
});

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(PORT, async () => {
  const provider = resolveProvider();
  console.log(`CallAI server http://localhost:${PORT}`);
  console.log(`Səs provider: ${provider || "YOX — API açarı lazımdır"}`);
  if (provider === "elevenlabs") {
    try {
      const { agent_id } = await ensureElevenAgent();
      console.log(`ElevenLabs agent hazır: ${agent_id}`);
    } catch (err) {
      console.warn("ElevenLabs agent sync xətası:", err.message || err);
    }
  }
});
