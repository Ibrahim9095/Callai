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

/** Natural call-center TTS defaults (not robotic slow, not rushed). */
export const TTS_CALL_CENTER = {
  /** Slightly above 1.0 = natural AZ call-center pace */
  speed: 1.08,
  stability: 0.42,
  similarity_boost: 0.78,
  optimize_streaming_latency: 3,
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
