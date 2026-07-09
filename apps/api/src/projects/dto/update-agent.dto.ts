import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { OPERATOR_CATALOG, VOICE_PROVIDERS, type VoiceProviderId } from "@aivoiceos/shared";

const OPERATOR_IDS = OPERATOR_CATALOG.map((o) => o.id);
const OPERATOR_NAMES = OPERATOR_CATALOG.map((o) => o.name);

export class UpdateAgentDto {
  @IsOptional()
  @IsIn(OPERATOR_NAMES)
  persona?: string;

  @IsOptional()
  @IsIn(OPERATOR_IDS)
  operatorId?: string;

  /** System Prompt — durable rules */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  prompt?: string;

  /** User Prompt — injected every call */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  userPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsIn(VOICE_PROVIDERS as unknown as string[])
  voiceProvider?: VoiceProviderId;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  greeting?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  temperature?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(64)
  @Max(4096)
  maxTokens?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
