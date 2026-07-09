import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { OPERATOR_CATALOG, VOICE_PROVIDERS, type VoiceProviderId } from "@aivoiceos/shared";

const OPERATOR_IDS = OPERATOR_CATALOG.map((o) => o.id);
const OPERATOR_NAMES = OPERATOR_CATALOG.map((o) => o.name);

export class UpdateAgentDto {
  /** Catalog display name: Leyla | Samir */
  @IsOptional()
  @IsIn(OPERATOR_NAMES)
  persona?: string;

  /** Catalog id: leyla | samir (preferred from admin UI) */
  @IsOptional()
  @IsIn(OPERATOR_IDS)
  operatorId?: string;

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
