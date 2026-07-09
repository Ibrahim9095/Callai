/**
 * Voice provider registry — ElevenLabs v3 Conversational is the production default.
 * Set VOICE_PROVIDER=edge_neural for free offline/dev fallback.
 * OpenAI Realtime remains available when VOICE_PROVIDER=openai.
 */

import type { VoiceProvider, VoiceEngineProviderId } from "@aivoiceos/voice-engine";
import { getEdgeNeuralProvider } from "./edge-neural.provider";
import { getOpenAiRealtimeProvider } from "./openai-realtime.provider";
import { openaiConfigured } from "./openai-config";
import {
  getElevenLabsV3Provider,
  elevenConfigured,
} from "./elevenlabs-v3.provider";

export function resolveVoiceProvider(
  _preferred?: string | null,
): VoiceProvider {
  const env = (process.env.VOICE_PROVIDER || "elevenlabs")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  if (env === "edge_neural" || env === "edge" || env === "local_open") {
    return getEdgeNeuralProvider();
  }

  if (env === "openai") {
    if (openaiConfigured()) return getOpenAiRealtimeProvider();
    console.warn("[voice] OPENAI_API_KEY missing — falling back");
  }

  // Production default + auto: ElevenLabs v3 when key present
  if (env === "elevenlabs" || env === "auto" || !env) {
    if (elevenConfigured()) return getElevenLabsV3Provider();
    console.warn("[voice] ELEVENLABS_API_KEY missing");
  }

  if (elevenConfigured()) return getElevenLabsV3Provider();
  if (openaiConfigured()) {
    console.warn("[voice] Falling back to OpenAI Realtime");
    return getOpenAiRealtimeProvider();
  }

  console.warn("[voice] No voice keys — falling back to edge_neural");
  return getEdgeNeuralProvider();
}

export function defaultVoiceProviderId(): VoiceEngineProviderId {
  const env = (process.env.VOICE_PROVIDER || "elevenlabs").trim().toLowerCase();
  if (env === "edge_neural" || env === "edge") return "edge_neural";
  if (env === "openai" && openaiConfigured()) return "openai";
  if (elevenConfigured()) return "elevenlabs";
  if (openaiConfigured()) return "openai";
  return "edge_neural";
}
