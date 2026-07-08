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
    voiceId: "eleven_v3_conversational",
    label: "ElevenLabs v3 (premium, ifadəli)",
    gender: "female",
    language: "az",
    premium: true,
  },
];

export const DEFAULT_VOICE: VoiceOption = VOICE_CATALOG[0];
