/**
 * Voice provider registry — pick adapter without touching call orchestration.
 * Default: edge_neural (free AZ Banu/Babek TTS). ElevenLabs is NOT used.
 */

import type { VoiceProvider, VoiceEngineProviderId } from "@aivoiceos/voice-engine";
import { getEdgeNeuralProvider } from "./edge-neural.provider";

export function resolveVoiceProvider(
  preferred?: string | null,
): VoiceProvider {
  const id = (preferred || process.env.VOICE_PROVIDER || "edge_neural")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");

  // Map legacy / catalog names onto the free neural pipeline
  if (
    id === "edge_neural" ||
    id === "edge" ||
    id === "azure" ||
    id === "local_open" ||
    id === "auto"
  ) {
    return getEdgeNeuralProvider();
  }

  // Explicitly refuse ElevenLabs as default path (cost / lock-in)
  if (id === "elevenlabs") {
    console.warn(
      "[voice] ElevenLabs requested but disabled by policy — using edge_neural",
    );
    return getEdgeNeuralProvider();
  }

  if (id === "openai") {
    // OpenAI Realtime not wired as default; use pipeline with OpenAI LLM + Edge TTS
    return getEdgeNeuralProvider();
  }

  return getEdgeNeuralProvider();
}

export function defaultVoiceProviderId(): VoiceEngineProviderId {
  return "edge_neural";
}
