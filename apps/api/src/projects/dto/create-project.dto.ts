import { IsIn, IsOptional, IsString, MaxLength, MinLength, Validate } from "class-validator";
import { isValidTemplateSelection, OPERATOR_CATALOG } from "@aivoiceos/shared";
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

@ValidatorConstraint({ name: "templateSelection", async: false })
class TemplateSelection implements ValidatorConstraintInterface {
  validate(value: string) {
    return typeof value === "string" && isValidTemplateSelection(value);
  }
  defaultMessage() {
    return "Naməlum biznes şablonu";
  }
}

const OPERATOR_IDS = OPERATOR_CATALOG.map((o) => o.id);
const OPERATOR_NAMES = OPERATOR_CATALOG.map((o) => o.name);

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  /** Known template id (e.g. "hotel") or "custom". */
  @Validate(TemplateSelection)
  businessTemplate!: string;

  /** Required when businessTemplate === "custom": free-text business type. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customType?: string;

  /** Catalog operator id: leyla | samir (preferred). */
  @IsOptional()
  @IsIn(OPERATOR_IDS)
  operatorId?: string;

  /** Catalog operator display name: Leyla | Samir (alias). */
  @IsOptional()
  @IsIn(OPERATOR_NAMES)
  operator?: string;
}
