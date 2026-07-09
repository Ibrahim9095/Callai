/**
 * Voice provider contracts. The platform is provider-agnostic (ADR-0003).
 *
 * Production default: ElevenLabs v3 Conversational (native AZ, expressive).
 * OpenAI Realtime / Edge Neural remain swappable adapters.
 */
export const VOICE_PROVIDERS = [
  "elevenlabs",
  "openai",
  "edge_neural",
  "azure",
  "local_open",
] as const;
export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number];

export interface VoiceOption {
  provider: VoiceProviderId;
  /** Provider-specific voice identifier */
  voiceId: string;
  label: string;
  gender: "female" | "male" | "neutral";
  language: string;
  premium: boolean;
}

/**
 * Curated voice catalog — ElevenLabs v3 primary (Leyla/Samir).
 */
export const VOICE_CATALOG: VoiceOption[] = [
  {
    provider: "elevenlabs",
    voiceId: "FDs1ZX5J4e4f2c2erxtW",
    label: "Leyla (ElevenLabs v3, qadın) — Fili",
    gender: "female",
    language: "az",
    premium: true,
  },
  {
    provider: "elevenlabs",
    voiceId: "iP95p4xoKVk53GoZ742B",
    label: "Samir (ElevenLabs v3, kişi)",
    gender: "male",
    language: "az",
    premium: true,
  },
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

/** Resolve ElevenLabs voice id from catalog / gender / env-style aliases. */
export function resolveElevenLabsVoiceId(opts: {
  voiceProvider?: string | null;
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | "neutral";
}): string {
  const v = (opts.voiceId || "").trim();
  if (/^[a-zA-Z0-9]{20,}$/.test(v)) return v;
  const lower = v.toLowerCase();
  const wantMale =
    lower.includes("babek") ||
    lower.includes("cedar") ||
    lower.includes("male") ||
    lower.includes("samir") ||
    opts.gender === "male";
  return wantMale ? "iP95p4xoKVk53GoZ742B" : "FDs1ZX5J4e4f2c2erxtW";
}

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

export function voiceGenderFromCatalog(voiceId?: string | null): "female" | "male" | "unknown" {
  const v = (voiceId || "").toLowerCase();
  if (
    v.includes("babek") ||
    v.includes("cedar") ||
    v.includes("male") ||
    v === "ip95p4xokvk53goz742b"
  ) {
    return "male";
  }
  if (
    v.includes("banu") ||
    v.includes("marin") ||
    v.includes("female") ||
    v === "fds1zx5j4e4f2c2erxtw"
  ) {
    return "female";
  }
  const hit = VOICE_CATALOG.find((c) => c.voiceId === voiceId);
  if (hit?.gender === "male" || hit?.gender === "female") return hit.gender;
  return "unknown";
}
