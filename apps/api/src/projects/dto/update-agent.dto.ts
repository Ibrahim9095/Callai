import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { VOICE_PROVIDERS, type VoiceProviderId } from "@aivoiceos/shared";

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  persona?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  prompt?: string;

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
  @IsBoolean()
  active?: boolean;
}
