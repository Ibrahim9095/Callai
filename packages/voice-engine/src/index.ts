/**
 * @aivoiceos/voice-engine — provider-agnostic VoiceProvider port.
 * Adapters plug in without changing call orchestration.
 */

export type VoiceTransport = "pipeline" | "websocket" | "webrtc";

export type VoiceEngineProviderId =
  | "edge_neural"
  | "azure"
  | "openai"
  | "elevenlabs"
  | "local_open";

export interface VoiceAgentSpec {
  projectId: string;
  projectName: string;
  persona: string;
  gender: "female" | "male" | "unknown";
  language: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
  voiceProvider?: string | null;
  temperature?: number;
  maxTokens?: number | null;
  keywords?: string[];
  cachedExternalId?: string | null;
}

export interface VoiceSessionCredentials {
  provider: VoiceEngineProviderId;
  /** pipeline = browser STT + server LLM/TTS turns (no vendor realtime socket) */
  transport: VoiceTransport;
  /** Only for websocket/webrtc vendors */
  signedUrl?: string;
  token?: string;
  externalAgentId?: string | null;
  firstMessage: string;
  /** Catalog voice for TTS */
  ttsVoiceId: string;
  operatorName: string;
  operatorGender: "female" | "male" | "unknown";
}

export interface SpeakRequest {
  text: string;
  voiceId: string;
  /** rate e.g. "+8%" for call-center pace */
  rate?: string;
}

export interface SpeakResult {
  /** audio/webm;codecs=opus or audio/mpeg base64 */
  audioBase64: string;
  mimeType: string;
  provider: VoiceEngineProviderId;
}

export interface TurnRequest {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  userText: string;
  voiceId: string;
  temperature?: number;
  maxTokens?: number | null;
  /** SSML/Edge rate e.g. "+20%" */
  rate?: string;
}

export interface TurnResult {
  replyText: string;
  audioBase64: string;
  mimeType: string;
  provider: VoiceEngineProviderId;
}

/**
 * Port every TTS/STT/LLM voice backend must implement.
 * Swap providers without touching VoiceService / admin UI.
 */
export interface VoiceProvider {
  readonly id: VoiceEngineProviderId;
  configured(): boolean;
  /** Optional remote agent sync (realtime vendors). Pipeline providers no-op. */
  createOrSyncAgent?(spec: VoiceAgentSpec): Promise<{ externalId: string | null; recreated: boolean }>;
  issueClientSession(spec: VoiceAgentSpec): Promise<VoiceSessionCredentials>;
  speak(req: SpeakRequest): Promise<SpeakResult>;
  /** Full conversational turn: LLM + TTS (pipeline providers). */
  turn?(req: TurnRequest): Promise<TurnResult>;
}

export function resolveTtsVoiceId(opts: {
  voiceId?: string | null;
  gender?: "female" | "male" | "unknown" | null;
}): string {
  const v = (opts.voiceId || "").toLowerCase();
  if (v.includes("babek") || v.includes("male") || opts.gender === "male") {
    return "az-AZ-BabekNeural";
  }
  return "az-AZ-BanuNeural";
}
