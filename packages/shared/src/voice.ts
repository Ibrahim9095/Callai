/**
 * Voice provider contracts. The platform is provider-agnostic (ADR-0003).
 *
 * Production default: OpenAI Realtime (speech-to-speech, low latency).
 * Edge Neural / Azure / local_open remain swappable adapters.
 * ElevenLabs is NOT used (cost / lock-in).
 */
export const VOICE_PROVIDERS = ["openai", "edge_neural", "azure", "local_open"] as const;
export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number];

export interface VoiceOption {
  provider: VoiceProviderId;
  /** Provider-specific voice identifier (e.g. OpenAI "marin", Edge "az-AZ-BanuNeural"). */
  voiceId: string;
  label: string;
  gender: "female" | "male" | "neutral";
  language: string;
  premium: boolean;
}

/**
 * Curated voice catalog — OpenAI Realtime voices (marin/cedar recommended).
 */
export const VOICE_CATALOG: VoiceOption[] = [
  {
    provider: "openai",
    voiceId: "marin",
    label: "Marin (OpenAI, qadın) — Realtime",
    gender: "female",
    language: "az",
    premium: false,
  },
  {
    provider: "openai",
    voiceId: "cedar",
    label: "Cedar (OpenAI, kişi) — Realtime",
    gender: "male",
    language: "az",
    premium: false,
  },
  {
    provider: "edge_neural",
    voiceId: "az-AZ-BanuNeural",
    label: "Banu (Edge neural, qadın) — fallback",
    gender: "female",
    language: "az-AZ",
    premium: false,
  },
  {
    provider: "edge_neural",
    voiceId: "az-AZ-BabekNeural",
    label: "Babək (Edge neural, kişi) — fallback",
    gender: "male",
    language: "az-AZ",
    premium: false,
  },
];

export const DEFAULT_VOICE: VoiceOption = VOICE_CATALOG[0];

/** Resolve OpenAI Realtime voice id from catalog / gender. */
export function resolveOpenAiCatalogVoiceId(opts: {
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | "neutral";
}): string {
  const catalogId = (opts.voiceId || "").toLowerCase();
  const known = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
  ];
  if (known.includes(catalogId)) return catalogId;
  const wantMale =
    catalogId.includes("babek") ||
    catalogId.includes("cedar") ||
    catalogId.includes("male") ||
    opts.gender === "male";
  return wantMale ? "cedar" : "marin";
}

/** Resolve Edge/Azure neural TTS voice id (Banu / Babek). */
export function resolveNeuralVoiceId(opts: {
  voiceProvider?: string | null;
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | "neutral";
}): string {
  const catalogId = (opts.voiceId || "").toLowerCase();
  const wantMale =
    catalogId.includes("babek") ||
    catalogId.includes("male") ||
    catalogId.includes("cedar") ||
    opts.gender === "male";
  return wantMale ? "az-AZ-BabekNeural" : "az-AZ-BanuNeural";
}

/** @deprecated */
export function resolveElevenLabsVoiceId(opts: {
  voiceProvider?: string | null;
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | "neutral";
}): string {
  return resolveOpenAiCatalogVoiceId(opts);
}

export function voiceGenderFromCatalog(voiceId?: string | null): "female" | "male" | "unknown" {
  const v = (voiceId || "").toLowerCase();
  if (v.includes("babek") || v.includes("cedar") || v.includes("male")) return "male";
  if (v.includes("banu") || v.includes("marin") || v.includes("female")) return "female";
  const hit = VOICE_CATALOG.find((c) => c.voiceId === voiceId);
  if (hit?.gender === "male" || hit?.gender === "female") return hit.gender;
  return "unknown";
}
