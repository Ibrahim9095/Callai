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

/** Fillers while LLM thinks — keeps the line feeling human, not frozen. */
export const SOFT_TIMEOUT_FILLERS_AZ = [
  "Bir saniyə…",
  "Baxım…",
  "Hmm…",
  "Bir an…",
] as const;

/**
 * Call-center TTS: clear Bakı phonemes + fast first audio.
 */
export const TTS_CALL_CENTER = {
  /** Natural phone pace — slightly brisk so replies feel alive */
  speed: 1.05,
  stability: 0.4,
  similarity_boost: 0.8,
  /** 3 = faster first byte (human-like snappy replies) */
  optimize_streaming_latency: 3,
} as const;

/**
 * Human-like turn-taking:
 * - normal eagerness = don't jump mid-sentence, but don't wait forever
 * - soft timeout fillers = no dead air while thinking
 * - never auto-hangup on silence
 */
export const TURN_CALL_CENTER = {
  /** Re-engage if user goes quiet (seconds) */
  turn_timeout: 12,
  silence_end_call_timeout: -1,
  /** Balanced: waits for natural end of user phrase, then answers quickly */
  turn_eagerness: "normal" as const,
  speculative_turn: true,
  turn_model: "turn_v3",
  /** Speak a filler if LLM is slow — feels human, not laggy */
  soft_timeout_seconds: 2.5,
  max_soft_timeouts_per_generation: 3,
} as const;

/**
 * Short backchannels that must NOT cut the agent mid-sentence.
 * (User saying "hə / bəli" while listening.)
 */
export const INTERRUPTION_IGNORE_TERMS_AZ = [
  "hə",
  "he",
  "bəli",
  "beli",
  "aydındır",
  "başa düşdüm",
  "basa dusdum",
  "tamam",
  "ok",
  "okay",
  "hmm",
  "aha",
  "mm",
  "mhm",
] as const;
