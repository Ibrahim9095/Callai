/**
 * OpenAI Voice Engine config — ALL model/voice IDs come from env.
 * Never hardcode production model names in call paths; change env to upgrade.
 *
 * Defaults track OpenAI's current recommended Realtime stack (2026):
 *   Realtime speech-to-speech : OPENAI_REALTIME_MODEL
 *   Input transcription (STT) : OPENAI_STT_MODEL
 *   Standalone TTS fallback   : OPENAI_TTS_MODEL
 *   Chat fallback (text)      : OPENAI_CHAT_MODEL
 */

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
    "gpt-realtime-2.1"
  ).trim();
}

/** Streaming / request STT model used inside Realtime input transcription. */
export function openaiSttModel(): string {
  return (
    process.env.OPENAI_STT_MODEL ||
    process.env.VOICE_STT_MODEL ||
    "gpt-4o-transcribe"
  ).trim();
}

/** Standalone TTS model (pipeline fallback / speak endpoint). */
export function openaiTtsModel(): string {
  return (
    process.env.OPENAI_TTS_MODEL ||
    process.env.VOICE_TTS_MODEL ||
    "tts-1"
  ).trim();
}

/** Text chat model for non-realtime pipeline fallback. */
export function openaiChatModel(): string {
  return (
    process.env.OPENAI_CHAT_MODEL ||
    process.env.VOICE_LLM_MODEL ||
    "gpt-4o-mini"
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

const REALTIME_VOICES = [
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
] as const;

/** Classic /v1/audio/speech voices (tts-1) — marin/cedar are Realtime-only. */
const SPEECH_API_VOICES = [
  "nova",
  "shimmer",
  "echo",
  "onyx",
  "fable",
  "alloy",
  "ash",
  "sage",
  "coral",
] as const;

/** Map operator gender / catalog voice → OpenAI Realtime voice id. */
export function resolveOpenAiVoice(opts: {
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | null;
}): string {
  const v = (opts.voiceId || "").toLowerCase();
  if ((REALTIME_VOICES as readonly string[]).includes(v)) return v;
  if (v.includes("babek") || v.includes("male") || opts.gender === "male") {
    return openaiVoiceMale();
  }
  return openaiVoiceFemale();
}

/** Map to a voice accepted by POST /v1/audio/speech (standalone TTS fallback). */
export function resolveOpenAiSpeechApiVoice(opts: {
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | null;
}): string {
  const v = (opts.voiceId || "").toLowerCase();
  if ((SPEECH_API_VOICES as readonly string[]).includes(v)) return v;
  // Realtime-only → closest classic voice
  if (v === "marin" || v === "coral" || v === "verse") return "nova";
  if (v === "cedar" || v === "ballad") return "onyx";
  if (v.includes("babek") || v.includes("male") || opts.gender === "male") {
    return "onyx";
  }
  return "nova";
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
