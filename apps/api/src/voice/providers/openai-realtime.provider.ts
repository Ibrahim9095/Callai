/**
 * OpenAI Realtime Voice Provider — primary production engine for AI Voice OS.
 *
 * Transport: WebRTC (browser ↔ OpenAI) via ephemeral client secret.
 * STT + LLM + TTS happen inside one Realtime speech-to-speech session →
 * target reply latency ~1–2s (no multi-hop browser STT → chat → TTS).
 *
 * All model / voice IDs are env-driven (see openai-config.ts).
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
  openaiApiKey,
  openaiChatModel,
  openaiConfigured,
  openaiRealtimeModel,
  openaiSafetyIdentifier,
  openaiSttModel,
  openaiTtsModel,
  openaiVadConfig,
  resolveOpenAiSpeechApiVoice,
  resolveOpenAiVoice,
} from "./openai-config";

function buildRealtimeSessionConfig(spec: VoiceAgentSpec) {
  const voice = resolveOpenAiVoice({
    voiceId: spec.voiceId,
    gender: spec.gender,
  });
  const language = (spec.language || "az").slice(0, 2);

  return {
    type: "realtime" as const,
    model: openaiRealtimeModel(),
    instructions: spec.systemPrompt,
    output_modalities: ["audio"],
    tools: AGENT_TOOLS,
    tool_choice: "auto",
    audio: {
      input: {
        transcription: {
          model: openaiSttModel(),
          language,
        },
        turn_detection: openaiVadConfig(),
      },
      output: {
        voice,
      },
    },
  };
}

export class OpenAiRealtimeVoiceProvider implements VoiceProvider {
  readonly id = "openai" as const;

  configured(): boolean {
    return openaiConfigured();
  }

  async createOrSyncAgent(_spec: VoiceAgentSpec) {
    return { externalId: null, recreated: false };
  }

  async issueClientSession(spec: VoiceAgentSpec): Promise<VoiceSessionCredentials> {
    if (!this.configured()) {
      throw new Error("OPENAI_API_KEY təyin edilməyib");
    }

    const sessionConfig = buildRealtimeSessionConfig(spec);
    const voice = sessionConfig.audio.output.voice;

    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey()}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": openaiSafetyIdentifier(spec.projectId),
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: sessionConfig,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        data?.error?.message || `OpenAI Realtime session xətası (${res.status})`,
      );
    }

    const token = String(data.value || data.client_secret?.value || "");
    if (!token) {
      throw new Error("OpenAI ephemeral token alınmadı");
    }

    return {
      provider: this.id,
      transport: "webrtc",
      token,
      firstMessage: spec.firstMessage,
      ttsVoiceId: voice,
      operatorName: spec.persona,
      operatorGender: spec.gender,
      externalAgentId: null,
      model: data.session?.model || openaiRealtimeModel(),
      expiresAt: data.expires_at,
      sttModel: openaiSttModel(),
    };
  }

  /** Standalone OpenAI TTS (greeting preview / non-realtime fallback). */
  async speak(req: SpeakRequest): Promise<SpeakResult> {
    if (!this.configured()) {
      throw new Error("OPENAI_API_KEY təyin edilməyib");
    }
    const text = String(req.text || "").trim();
    if (!text) {
      return { audioBase64: "", mimeType: "audio/mpeg", provider: this.id };
    }
    // Standalone Speech API does not accept Realtime-only voices (marin/cedar)
    const voice = resolveOpenAiSpeechApiVoice({ voiceId: req.voiceId });
    const speedRaw = Number(process.env.OPENAI_TTS_SPEED || "1.15");
    const speed = Number.isFinite(speedRaw)
      ? Math.min(4, Math.max(0.25, speedRaw))
      : 1.15;
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openaiTtsModel(),
        voice,
        input: text,
        response_format: "mp3",
        speed,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg =
        err?.error?.message ||
        (Array.isArray(err) ? JSON.stringify(err) : null) ||
        `OpenAI TTS xətası (${res.status})`;
      throw new Error(msg);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      audioBase64: buf.toString("base64"),
      mimeType: "audio/mpeg",
      provider: this.id,
    };
  }

  /**
   * Text turn fallback (not used on Realtime WebRTC path).
   * Kept for tools/debug and if client falls back to pipeline.
   */
  async turn(req: TurnRequest): Promise<TurnResult> {
    if (!this.configured()) {
      throw new Error("OPENAI_API_KEY təyin edilməyib");
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: req.systemPrompt },
      ...req.history
        .filter((h) => h.role === "user" || h.role === "assistant")
        .slice(-10)
        .map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
      { role: "user", content: req.userText },
    ];

    const maxTokens =
      req.maxTokens && req.maxTokens > 0 ? Math.min(req.maxTokens, 180) : 120;
    const temperature =
      typeof req.temperature === "number"
        ? Math.min(1, Math.max(0, req.temperature))
        : 0.35;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openaiChatModel(),
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
    if (!replyText) throw new Error("LLM boş cavab qaytardı");

    const spoken = await this.speak({
      text: replyText,
      voiceId: req.voiceId,
    });

    return {
      replyText,
      audioBase64: spoken.audioBase64,
      mimeType: spoken.mimeType,
      provider: this.id,
    };
  }
}

let singleton: OpenAiRealtimeVoiceProvider | null = null;
export function getOpenAiRealtimeProvider() {
  if (!singleton) singleton = new OpenAiRealtimeVoiceProvider();
  return singleton;
}
