/**
 * OpenAI Voice Engine config — ALL model/voice IDs come from env.
 * Never hardcode production model names in call paths; change env to upgrade.
 *
 * Mandatory AI Voice OS defaults:
 *   STT : gpt-4o-transcribe   (OPENAI_STT_MODEL)
 *   TTS : gpt-4o-mini-tts     (OPENAI_TTS_MODEL)
 *   Realtime S2S (low latency): OPENAI_REALTIME_MODEL
 *
 * Only OPENAI_API_KEY is required in .env to run.
 */

/** Canonical mandatory defaults (override via env only). */
export const DEFAULT_OPENAI_STT_MODEL = "gpt-4o-transcribe";
export const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
export const DEFAULT_OPENAI_REALTIME_MODEL = "gpt-realtime-2.1";
export const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";

export function openaiApiKey(): string {
  return (process.env.OPENAI_API_KEY || "").trim();
}

export function openaiConfigured(): boolean {
  return Boolean(openaiApiKey());
}

/** Primary Realtime speech-to-speech model (low latency voice agent). */
export function openaiRealtimeModel(): string {
  return (
    process.env.OPENAI_REALTIME_MODEL ||
    process.env.VOICE_REALTIME_MODEL ||
    DEFAULT_OPENAI_REALTIME_MODEL
  ).trim();
}

/**
 * STT — mandatory: gpt-4o-transcribe
 * Used as Realtime input transcription + any standalone transcription.
 */
export function openaiSttModel(): string {
  const fromEnv = (
    process.env.OPENAI_STT_MODEL ||
    process.env.VOICE_STT_MODEL ||
    DEFAULT_OPENAI_STT_MODEL
  ).trim();
  // Refuse legacy whisper / mini-transcribe as production STT
  if (/whisper|tts-1/i.test(fromEnv)) {
    console.warn(
      `[voice] OPENAI_STT_MODEL=${fromEnv} is not allowed — using ${DEFAULT_OPENAI_STT_MODEL}`,
    );
    return DEFAULT_OPENAI_STT_MODEL;
  }
  return fromEnv || DEFAULT_OPENAI_STT_MODEL;
}

/**
 * TTS — mandatory: gpt-4o-mini-tts
 * Used for speak endpoint and pipeline fallback (not classic tts-1).
 */
export function openaiTtsModel(): string {
  const fromEnv = (
    process.env.OPENAI_TTS_MODEL ||
    process.env.VOICE_TTS_MODEL ||
    DEFAULT_OPENAI_TTS_MODEL
  ).trim();
  if (/^tts-1/i.test(fromEnv)) {
    console.warn(
      `[voice] OPENAI_TTS_MODEL=${fromEnv} is not allowed — using ${DEFAULT_OPENAI_TTS_MODEL}`,
    );
    return DEFAULT_OPENAI_TTS_MODEL;
  }
  return fromEnv || DEFAULT_OPENAI_TTS_MODEL;
}

/** Text chat model for non-realtime pipeline fallback. */
export function openaiChatModel(): string {
  return (
    process.env.OPENAI_CHAT_MODEL ||
    process.env.VOICE_LLM_MODEL ||
    DEFAULT_OPENAI_CHAT_MODEL
  ).trim();
}

/** Default OpenAI voice (best quality: marin / cedar). */
export function openaiDefaultVoice(): string {
  return (process.env.OPENAI_VOICE || process.env.AGENT_VOICE || "marin").trim();
}

export function openaiVoiceFemale(): string {
  return (process.env.OPENAI_VOICE_FEMALE || openaiDefaultVoice() || "marin").trim();
}

export function openaiVoiceMale(): string {
  return (process.env.OPENAI_VOICE_MALE || "cedar").trim();
}

/** Voices supported by Realtime + gpt-4o-mini-tts. */
const OPENAI_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

/** Map operator gender / catalog voice → OpenAI voice id. */
export function resolveOpenAiVoice(opts: {
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | null;
}): string {
  const v = (opts.voiceId || "").toLowerCase();
  if ((OPENAI_VOICES as readonly string[]).includes(v)) return v;
  if (v.includes("babek") || v.includes("male") || opts.gender === "male") {
    return openaiVoiceMale();
  }
  return openaiVoiceFemale();
}

/**
 * Voice for POST /v1/audio/speech (gpt-4o-mini-tts).
 * marin / cedar are supported on gpt-4o-mini-tts (recommended quality).
 */
export function resolveOpenAiSpeechApiVoice(opts: {
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | null;
}): string {
  return resolveOpenAiVoice(opts);
}

/** Natural Azerbaijani call-center delivery for gpt-4o-mini-tts `instructions`. */
export function openaiTtsInstructions(opts?: {
  persona?: string | null;
  gender?: "female" | "male" | "unknown" | null;
}): string {
  const fromEnv = (process.env.OPENAI_TTS_INSTRUCTIONS || "").trim();
  if (fromEnv) return fromEnv;
  const who =
    opts?.gender === "male"
      ? "Speak as a warm, professional male call-center operator."
      : "Speak as a warm, professional female call-center operator.";
  return [
    who,
    "Language: fluent Azerbaijani (Baku dialect). Clear, natural, human — not robotic.",
    "Pace: brisk call-center tempo, no long pauses between words.",
    "Tone: friendly, polite, patient, empathetic. Never rude.",
    "Do not sound like a script or announcement.",
  ].join(" ");
}

/** Server VAD — tuned for call-center: fast turn-taking, barge-in on. */
export function openaiVadConfig() {
  const silence = Number(process.env.OPENAI_VAD_SILENCE_MS || "400");
  const threshold = Number(process.env.OPENAI_VAD_THRESHOLD || "0.5");
  const prefix = Number(process.env.OPENAI_VAD_PREFIX_MS || "200");
  return {
    type: "server_vad" as const,
    threshold: Number.isFinite(threshold) ? threshold : 0.5,
    prefix_padding_ms: Number.isFinite(prefix) ? prefix : 200,
    silence_duration_ms: Number.isFinite(silence) ? silence : 400,
    create_response: true,
    interrupt_response: true,
  };
}

export function openaiSafetyIdentifier(projectId?: string): string {
  const base = process.env.OPENAI_SAFETY_IDENTIFIER || "aivoiceos";
  return projectId ? `${base}:${projectId}` : base;
}
