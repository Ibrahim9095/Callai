import { IsString, MinLength } from "class-validator";

export class AssignPhoneDto {
  /** Raw Azerbaijani number in any common format; normalized server-side. */
  @IsString()
  @MinLength(7)
  number!: string;
}
