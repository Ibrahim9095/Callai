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
  language: string;
  voiceProvider: VoiceProviderId;
  voiceId: string;
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
  language?: string;
  voiceProvider?: VoiceProviderId;
  voiceId?: string;
  greeting?: string;
  active?: boolean;
}
