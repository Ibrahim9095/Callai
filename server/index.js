import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { AGENT_INSTRUCTIONS, REALTIME_TOOLS } from "./agent.js";
import { toolHandlers, getStoreInfo, searchProducts, getOrderStatus } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
const VOICE = process.env.AGENT_VOICE || "marin";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

function buildSessionConfig() {
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
  res.json({
    ok: true,
    hasApiKey: Boolean(OPENAI_API_KEY),
    model: REALTIME_MODEL,
    voice: VOICE,
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
 * Ephemeral client secret for browser WebRTC → OpenAI Realtime (GA).
 * Keeps the secret API key on the server.
 */
app.post("/api/realtime/session", async (_req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY təyin edilməyib. server/.env faylına açar əlavə edin.",
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "callai-store-operator",
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 600,
        },
        session: buildSessionConfig(),
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

    // Normalize for the client: GA returns { value, expires_at, session }
    res.json({
      value: data.value,
      client_secret: { value: data.value },
      model: data.session?.model || REALTIME_MODEL,
      voice: data.session?.audio?.output?.voice || VOICE,
      expires_at: data.expires_at,
      session: data.session,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Session yaradılarkən xəta baş verdi", message: err.message });
  }
});

/** Execute store/operator tools called by the realtime model */
app.post("/api/tools/:name", (req, res) => {
  const handler = toolHandlers[req.params.name];
  if (!handler) {
    return res.status(404).json({ error: `Alət tapılmadı: ${req.params.name}` });
  }
  try {
    const result = handler(req.body || {});
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

app.listen(PORT, () => {
  console.log(`CallAI server http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.warn("⚠ OPENAI_API_KEY yoxdur — səsli sessiya işləməyəcək.");
  }
});
