import { IsString } from "class-validator";

export class RedirectDto {
    @IsString()
    code: string;
  }