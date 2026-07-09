import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  OPERATOR_CATALOG,
  SPEECH_SPEEDS,
  VOICE_PROVIDERS,
  type VoiceProviderId,
} from "@aivoiceos/shared";

const OPERATOR_IDS = OPERATOR_CATALOG.map((o) => o.id);
const OPERATOR_NAMES = OPERATOR_CATALOG.map((o) => o.name);

export class UpdateAgentDto {
  @IsOptional()
  @IsIn(OPERATOR_NAMES)
  persona?: string;

  @IsOptional()
  @IsIn(OPERATOR_IDS)
  operatorId?: string;

  /** System Prompt — durable technical rules */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  prompt?: string;

  /** User Prompt — conversation style / behaviour */
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

  /** Spoken greeting (TTS on call open) */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  greeting?: string;

  /** Speech speed multiplier */
  @IsOptional()
  @IsNumber()
  @IsIn(SPEECH_SPEEDS as unknown as number[])
  speechSpeed?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
