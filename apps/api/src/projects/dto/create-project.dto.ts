import { IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { BUSINESS_TEMPLATES, type BusinessTemplateId } from "@aivoiceos/shared";

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(BUSINESS_TEMPLATES as unknown as string[])
  businessTemplate!: BusinessTemplateId;
}
