import { IsArray, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateCollectionDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,40}$/, {
    message: "name yalnız kiçik hərf, rəqəm və alt-xətt ola bilər (məs. rooms)",
  })
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label!: string;

  @IsArray()
  fields!: Array<{ key: string; label: string; type: string; required?: boolean }>;
}

export class RecordDto {
  @IsObject()
  data!: Record<string, unknown>;
}

export class ImportCsvDto {
  @IsString()
  @MinLength(1)
  csv!: string;

  @IsOptional()
  @IsString()
  delimiter?: string;
}
