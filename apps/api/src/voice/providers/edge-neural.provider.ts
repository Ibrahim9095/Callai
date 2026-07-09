/**
 * Edge Neural Voice Provider — FREE Microsoft Edge neural TTS (az-AZ Banu/Babek)
 * + cheap OpenAI chat LLM + browser Web Speech STT.
 *
 * Why this is the production default for AI Voice OS v1:
 * - Native Azerbaijani neural voices (same Banu/Babek as Azure Speech)
 * - $0 TTS cost (no Azure Speech key / no ElevenLabs tokens)
 * - Provider-swappable via VoiceProvider port
 * - Low latency for short call-center turns
 *
 * Swap later to Azure Speech (paid, SLA) or local open models without
 * changing VoiceService / admin UI.
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type {
  SpeakRequest,
  SpeakResult,
  TurnRequest,
  TurnResult,
  VoiceAgentSpec,
  VoiceProvider,
  VoiceSessionCredentials,
} from "@aivoiceos/voice-engine";
import { resolveTtsVoiceId } from "@aivoiceos/voice-engine";

function openaiKey() {
  return process.env.OPENAI_API_KEY || "";
}

function llmModel() {
  // Prefer cheap models; override via VOICE_LLM_MODEL
  return process.env.VOICE_LLM_MODEL || "gpt-4o-mini";
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class EdgeNeuralVoiceProvider implements VoiceProvider {
  readonly id = "edge_neural" as const;

  configured(): boolean {
    // TTS is free and always available; LLM needs a key for dialogue.
    // Greeting-only still works without LLM (firstMessage TTS).
    return true;
  }

  llmConfigured(): boolean {
    return Boolean(openaiKey());
  }

  async createOrSyncAgent(_spec: VoiceAgentSpec) {
    // Pipeline has no remote agent to sync
    return { externalId: null, recreated: false };
  }

  async issueClientSession(spec: VoiceAgentSpec): Promise<VoiceSessionCredentials> {
    const ttsVoiceId = resolveTtsVoiceId({
      voiceId: spec.voiceId,
      gender: spec.gender,
    });
    return {
      provider: this.id,
      transport: "pipeline",
      firstMessage: spec.firstMessage,
      ttsVoiceId,
      operatorName: spec.persona,
      operatorGender: spec.gender,
      externalAgentId: null,
    };
  }

  async speak(req: SpeakRequest): Promise<SpeakResult> {
    const text = String(req.text || "").trim();
    if (!text) {
      return { audioBase64: "", mimeType: "audio/webm", provider: this.id };
    }
    const voiceId = resolveTtsVoiceId({ voiceId: req.voiceId });
    const tts = new MsEdgeTTS({ enableLogger: false });
    try {
      // WEBM opus — small, browser-friendly
      await tts.setMetadata(voiceId, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
      const { audioStream } = tts.toStream(text, {
        // Natural call-center pace (slightly brisk, not rushed)
        rate: req.rate || "+8%",
        pitch: "+0Hz",
        volume: "+0%",
      });
      const buf = await streamToBuffer(audioStream);
      return {
        audioBase64: buf.toString("base64"),
        mimeType: "audio/webm;codecs=opus",
        provider: this.id,
      };
    } finally {
      try {
        tts.close();
      } catch {
        /* ignore */
      }
    }
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    if (!this.llmConfigured()) {
      throw new Error(
        "Dialoq üçün OPENAI_API_KEY lazımdır (ucuz gpt-4o-mini). TTS pulsuzdur.",
      );
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: req.systemPrompt },
      ...req.history
        .filter((h) => h.role === "user" || h.role === "assistant")
        .slice(-12)
        .map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
      { role: "user", content: req.userText },
    ];

    const maxTokens =
      req.maxTokens && req.maxTokens > 0 ? Math.min(req.maxTokens, 280) : 140;
    const temperature =
      typeof req.temperature === "number" ? Math.min(1, Math.max(0, req.temperature)) : 0.35;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llmModel(),
        temperature,
        max_tokens: maxTokens,
        messages,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `LLM xətası (${res.status})`);
    }
    const replyText = String(data?.choices?.[0]?.message?.content || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!replyText) {
      throw new Error("LLM boş cavab qaytardı");
    }

    const spoken = await this.speak({
      text: replyText,
      voiceId: req.voiceId,
      rate: "+8%",
    });

    return {
      replyText,
      audioBase64: spoken.audioBase64,
      mimeType: spoken.mimeType,
      provider: this.id,
    };
  }
}

let singleton: EdgeNeuralVoiceProvider | null = null;
export function getEdgeNeuralProvider() {
  if (!singleton) singleton = new EdgeNeuralVoiceProvider();
  return singleton;
}
