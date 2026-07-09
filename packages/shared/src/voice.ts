/**
 * Voice provider contracts. The platform is provider-agnostic (ADR-0003):
 * Azure (native az-AZ, affordable) is default; ElevenLabs is premium; OpenAI is fallback.
 */
export const VOICE_PROVIDERS = ["azure", "elevenlabs", "openai"] as const;
export type VoiceProviderId = (typeof VOICE_PROVIDERS)[number];

export interface VoiceOption {
  provider: VoiceProviderId;
  /** Provider-specific voice identifier (e.g. Azure "az-AZ-BanuNeural"). */
  voiceId: string;
  label: string;
  gender: "female" | "male" | "neutral";
  language: string;
  premium: boolean;
}

/**
 * Curated default voice catalog. Extensible: new voices/providers are added
 * here or fetched live from a provider adapter later.
 *
 * Live browser calls currently use ElevenLabs Conversational (az). Azure IDs
 * are kept for future Azure Speech adapter; picking Azure in the panel maps
 * to the matching ElevenLabs gender voice until Azure live is wired.
 */
export const VOICE_CATALOG: VoiceOption[] = [
  {
    provider: "azure",
    voiceId: "az-AZ-BanuNeural",
    label: "Banu (Azərbaycan, qadın)",
    gender: "female",
    language: "az-AZ",
    premium: false,
  },
  {
    provider: "azure",
    voiceId: "az-AZ-BabekNeural",
    label: "Babək (Azərbaycan, kişi)",
    gender: "male",
    language: "az-AZ",
    premium: false,
  },
  {
    provider: "elevenlabs",
    voiceId: "elevenlabs-female",
    label: "ElevenLabs — qadın (premium)",
    gender: "female",
    language: "az",
    premium: true,
  },
  {
    provider: "elevenlabs",
    voiceId: "elevenlabs-male",
    label: "ElevenLabs — kişi (premium)",
    gender: "male",
    language: "az",
    premium: true,
  },
];

export const DEFAULT_VOICE: VoiceOption = VOICE_CATALOG[0];

/** Resolve the live ElevenLabs TTS voice id for a catalog selection + gender. */
export function resolveElevenLabsVoiceId(opts: {
  voiceProvider?: string | null;
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | "neutral";
}): string {
  // Default PoC voice (female-leaning, works with eleven_v3_conversational + az)
  const female =
    (typeof process !== "undefined" &&
      (process.env.ELEVENLABS_VOICE_ID_FEMALE || process.env.ELEVENLABS_VOICE_ID)) ||
    "FDs1ZX5J4e4f2c2erxtW";
  // Optional dedicated male voice — if unset, keep female voice id but persona stays male
  // (wrong pitch is better than crashing AZ TTS with an unsupported voice).
  const male =
    (typeof process !== "undefined" && process.env.ELEVENLABS_VOICE_ID_MALE) || female;

  const catalogId = (opts.voiceId || "").toLowerCase();
  const wantMale =
    catalogId.includes("babek") ||
    catalogId.includes("male") ||
    catalogId === "elevenlabs-male" ||
    opts.gender === "male";

  return wantMale ? male : female;
}

export function voiceGenderFromCatalog(voiceId?: string | null): "female" | "male" | "unknown" {
  const v = (voiceId || "").toLowerCase();
  if (v.includes("babek") || v.includes("male")) return "male";
  if (v.includes("banu") || v.includes("female")) return "female";
  const hit = VOICE_CATALOG.find((c) => c.voiceId === voiceId);
  if (hit?.gender === "male" || hit?.gender === "female") return hit.gender;
  return "unknown";
}
