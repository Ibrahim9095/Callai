/**
 * Call lifecycle policy — production gate for voice sessions.
 * ACTIVE projects may dial; INACTIVE (draft/paused) must not start Voice Engine.
 */

export type ProjectLifecycleStatus = "draft" | "active" | "paused";

export function isProjectVoiceActive(status: ProjectLifecycleStatus | string): boolean {
  return status === "active";
}

export function inactiveProjectMessage(status: ProjectLifecycleStatus | string): string {
  if (status === "draft") {
    return "Bu layihə hələ aktiv deyil. Admin paneldən «Aktiv et» basın.";
  }
  return "Bu layihə müvəqqəti deaktiv edilib. Zəng qəbul olunmur.";
}

/** Soft re-prompt when caller is silent during a live session. */
export const SILENCE_REPROMPT_AZ = "Narahat olmayın, sizi dinləyirəm.";

/**
 * High-quality call-center TTS for ElevenLabs v3 + Bakı phonetics.
 * Slightly slower than rushed chat = clearer ə/ö/ü; expressive but stable.
 */
export const TTS_CALL_CENTER = {
  /** ~1.02 keeps AZ phonemes clear without sounding slow */
  speed: 1.02,
  /** Lower = more natural variation (v3 expressive) */
  stability: 0.38,
  /** Higher = clearer voice identity / less mushy consonants */
  similarity_boost: 0.82,
  /** 2 = better quality than max-latency 3/4 for AZ clarity */
  optimize_streaming_latency: 2,
} as const;

export const TURN_CALL_CENTER = {
  turn_timeout: 25,
  silence_end_call_timeout: -1,
  turn_eagerness: "patient" as const,
  speculative_turn: true,
  turn_model: "turn_v3",
  soft_timeout_seconds: 7.5,
  max_soft_timeouts_per_generation: 3,
} as const;
