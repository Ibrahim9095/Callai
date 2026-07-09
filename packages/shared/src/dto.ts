import type { Role } from "./roles";
import type { BusinessTemplateId } from "./business-templates";
import type { VoiceProviderId } from "./voice";

export type ProjectStatus = "draft" | "active" | "paused";

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
}

export interface LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}

export interface AgentDto {
  id: string;
  projectId: string;
  persona: string;
  prompt: string;
  userPrompt?: string;
  language: string;
  voiceProvider: VoiceProviderId;
  voiceId: string;
  /** Spoken pace: 0.8 | 1.0 | 1.2 | 1.4 | 1.6 */
  speechSpeed?: number;
  greeting: string | null;
  active: boolean;
}

export interface ProjectDto {
  id: string;
  organizationId: string;
  name: string;
  businessTemplate: BusinessTemplateId;
  status: ProjectStatus;
  createdAt: string;
  agent?: AgentDto | null;
}

export interface CreateProjectDto {
  name: string;
  businessTemplate: BusinessTemplateId;
  /** Catalog operator id: leyla | samir */
  operatorId?: string;
  customType?: string;
}

export interface UpdateAgentDto {
  persona?: string;
  operatorId?: string;
  prompt?: string;
  userPrompt?: string;
  language?: string;
  voiceProvider?: VoiceProviderId;
  voiceId?: string;
  greeting?: string;
  speechSpeed?: number;
  active?: boolean;
}

/** Allowed speech speed multipliers for admin + TTS. */
export const SPEECH_SPEEDS = [0.8, 1.0, 1.2, 1.4, 1.6] as const;
export type SpeechSpeed = (typeof SPEECH_SPEEDS)[number];
export const DEFAULT_SPEECH_SPEED: SpeechSpeed = 1.2;

export function normalizeSpeechSpeed(raw: unknown): SpeechSpeed {
  const n = Number(raw);
  if ((SPEECH_SPEEDS as readonly number[]).includes(n)) return n as SpeechSpeed;
  return DEFAULT_SPEECH_SPEED;
}

/** Edge/Azure SSML rate from multiplier (1.0 → +0%, 1.2 → +20%). */
export function speechSpeedToEdgeRate(speed: number): string {
  const s = normalizeSpeechSpeed(speed);
  const pct = Math.round((s - 1) * 100);
  if (pct === 0) return "+0%";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}
