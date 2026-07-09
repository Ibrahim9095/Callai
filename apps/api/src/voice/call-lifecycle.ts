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
 * Soft-timeout filler — ONE short phrase only.
 * Stacking many fillers ("Bir an… Hmm… Baxım…") sounds robotic; keep a single human beat.
 */
export const SOFT_TIMEOUT_FILLERS_AZ = ["Bir saniyə…"] as const;

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
  /**
   * One soft filler if LLM is slow — avoid stacking.
   * 3.5s: fast replies skip filler; slow ones get a single human beat.
   */
  soft_timeout_seconds: 3.5,
  max_soft_timeouts_per_generation: 1,
} as const;

/**
 * Short backchannels / noise-like tokens that must NOT cut the agent mid-sentence.
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
  "hm",
  "aha",
  "aa",
  "ah",
  "eh",
  "mm",
  "mhm",
  "uh",
  "uhhuh",
  "uh-huh",
  "yeah",
  "ya",
] as const;

/**
 * Client barge-in gate (while operator is speaking).
 * Only sustained, intentional speech unmutes the mic toward ElevenLabs.
 * Short noise / breath / keyboard clicks stay below threshold and are ignored.
 */
export const BARGE_IN_GATE = {
  /** Analyser level 0–1; higher = less sensitive to noise */
  speechLevelThreshold: 0.22,
  /** Must stay above threshold this long before barge-in opens */
  speechHoldMs: 550,
  /** Drop below threshold this long → close barge-in again (while agent still speaking) */
  silenceReleaseMs: 280,
  /** Optional ElevenLabs onVadScore floor when available */
  vadScoreThreshold: 0.72,
} as const;
