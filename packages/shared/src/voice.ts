/**
 * Voice provider contracts. The platform is provider-agnostic (ADR-0003).
 *
 * Production default: Edge Neural (free Microsoft neural az-AZ Banu/Babek)
 * via the VoiceProvider port. Azure Speech (paid SLA) and local open models
 * plug in as adapters. ElevenLabs is NOT used (cost / lock-in).
 */
export const VOICE_PROVIDERS = ["azure", "edge_neural", "openai", "local_open"] as const;
export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number];

export interface VoiceOption {
  provider: VoiceProviderId;
  /** Provider-specific voice identifier (e.g. Azure/Edge "az-AZ-BanuNeural"). */
  voiceId: string;
  label: string;
  gender: "female" | "male" | "neutral";
  language: string;
  premium: boolean;
}

/**
 * Curated voice catalog — native Azerbaijani neural voices.
 * Live calls use Edge Neural (same Banu/Babek voices, $0 TTS).
 */
export const VOICE_CATALOG: VoiceOption[] = [
  {
    provider: "edge_neural",
    voiceId: "az-AZ-BanuNeural",
    label: "Banu (Azərbaycan, qadın) — pulsuz neural",
    gender: "female",
    language: "az-AZ",
    premium: false,
  },
  {
    provider: "edge_neural",
    voiceId: "az-AZ-BabekNeural",
    label: "Babək (Azərbaycan, kişi) — pulsuz neural",
    gender: "male",
    language: "az-AZ",
    premium: false,
  },
];

export const DEFAULT_VOICE: VoiceOption = VOICE_CATALOG[0];

/** Resolve neural TTS voice id (Banu / Babek) from catalog selection + gender. */
export function resolveNeuralVoiceId(opts: {
  voiceProvider?: string | null;
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | "neutral";
}): string {
  const catalogId = (opts.voiceId || "").toLowerCase();
  const wantMale =
    catalogId.includes("babek") ||
    catalogId.includes("male") ||
    opts.gender === "male";
  return wantMale ? "az-AZ-BabekNeural" : "az-AZ-BanuNeural";
}

/** @deprecated Use resolveNeuralVoiceId — ElevenLabs removed from default path. */
export function resolveElevenLabsVoiceId(opts: {
  voiceProvider?: string | null;
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | "neutral";
}): string {
  return resolveNeuralVoiceId(opts);
}

export function voiceGenderFromCatalog(voiceId?: string | null): "female" | "male" | "unknown" {
  const v = (voiceId || "").toLowerCase();
  if (v.includes("babek") || v.includes("male")) return "male";
  if (v.includes("banu") || v.includes("female")) return "female";
  const hit = VOICE_CATALOG.find((c) => c.voiceId === voiceId);
  if (hit?.gender === "male" || hit?.gender === "female") return hit.gender;
  return "unknown";
}
