import { IsIn } from "class-validator";

export const PROJECT_STATUSES = ["draft", "active", "paused"] as const;

export class SetStatusDto {
  @IsIn(PROJECT_STATUSES as unknown as string[])
  status!: (typeof PROJECT_STATUSES)[number];
}
