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
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
const VOICE = process.env.AGENT_VOICE || "coral";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
 * Ephemeral token for browser WebRTC → OpenAI Realtime.
 * Keeps the secret API key on the server.
 */
app.post("/api/realtime/session", async (_req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY təyin edilməyib. server/.env faylına açar əlavə edin.",
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: REALTIME_MODEL,
        voice: VOICE,
        modalities: ["audio", "text"],
        instructions: AGENT_INSTRUCTIONS,
        tools: REALTIME_TOOLS,
        tool_choice: "auto",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 250,
          silence_duration_ms: 450,
          create_response: true,
        },
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Realtime session error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "Realtime session yaradıla bilmədi",
        details: data,
      });
    }

    res.json({
      client_secret: data.client_secret,
      model: data.model || REALTIME_MODEL,
      voice: VOICE,
      expires_at: data.expires_at,
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
