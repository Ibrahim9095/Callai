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
 * Call-center TTS: loud, clear Bakı phonemes + fast first audio.
 * Tuned for Hope (female) / Adam (male) on eleven_v3_conversational.
 */
export const TTS_CALL_CENTER = {
  /** Natural phone pace — clear AZ, not rushed */
  speed: 1.0,
  /** Balanced: expressive but stable (less robotic / less chaotic) */
  stability: 0.4,
  /** Strong voice identity for Hope/Adam */
  similarity_boost: 0.85,
  /** Fast first byte for snappy operator replies */
  optimize_streaming_latency: 3,
  /** Client playback gain */
  playbackVolume: 1.4,
} as const;

/**
 * Human-like turn-taking:
 * - eager = answer quickly after caller finishes
 * - soft timeout fillers = no dead air while thinking
 * - never auto-hangup on silence
 */
export const TURN_CALL_CENTER = {
  /** Re-engage if user goes quiet (seconds) — keep call alive */
  turn_timeout: 15,
  silence_end_call_timeout: -1,
  /** Normal: don't jump mid-greeting / mid-sentence; still answers quickly */
  turn_eagerness: "normal" as const,
  speculative_turn: true,
  turn_model: "turn_v3",
  /**
   * One soft filler if LLM is slow — avoid stacking.
   * 3.2s: most replies skip filler; slow ones get a single human beat.
   */
  soft_timeout_seconds: 3.2,
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
 * Mic stays OPEN so ElevenLabs can hear the caller and stop TTS on interrupt.
 * Gate only filters obvious noise from triggering false barge-in locally.
 * Real speech must reach the agent quickly so the operator stops talking.
 */
export const BARGE_IN_GATE = {
  /** Analyser level 0–1 — lower = more responsive to real speech */
  speechLevelThreshold: 0.12,
  /** Open barge-in after this much sustained speech (ms) */
  speechHoldMs: 180,
  /** Drop below threshold this long → treat as pause (ms) */
  silenceReleaseMs: 220,
  /** ElevenLabs onVadScore floor when available */
  vadScoreThreshold: 0.45,
} as const;
