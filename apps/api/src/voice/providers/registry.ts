/**
 * Voice provider registry — OpenAI Realtime is the mandatory production default.
 * Set VOICE_PROVIDER=edge_neural only for free offline/dev fallback.
 */

import type { VoiceProvider, VoiceEngineProviderId } from "@aivoiceos/voice-engine";
import { getEdgeNeuralProvider } from "./edge-neural.provider";
import { getOpenAiRealtimeProvider } from "./openai-realtime.provider";
import { openaiConfigured } from "./openai-config";

export function resolveVoiceProvider(
  _preferred?: string | null,
): VoiceProvider {
  const env = (process.env.VOICE_PROVIDER || "openai")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (env === "elevenlabs") {
    console.warn("[voice] ElevenLabs disabled — using OpenAI Realtime");
  }

  // Explicit free/dev fallback
  if (env === "edge_neural" || env === "edge" || env === "local_open") {
    return getEdgeNeuralProvider();
  }

  // Production default: OpenAI Realtime (STT + LLM + TTS in one low-latency session)
  if (openaiConfigured()) {
    return getOpenAiRealtimeProvider();
  }

  console.warn("[voice] OPENAI_API_KEY missing — falling back to edge_neural");
  return getEdgeNeuralProvider();
}

export function defaultVoiceProviderId(): VoiceEngineProviderId {
  const env = (process.env.VOICE_PROVIDER || "openai").trim().toLowerCase();
  if (env === "edge_neural" || env === "edge") return "edge_neural";
  if (openaiConfigured()) return "openai";
  return "edge_neural";
}
