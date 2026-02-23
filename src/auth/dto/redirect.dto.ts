import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RedirectDto {
  @IsString()
  @MaxLength(500)
  code: string;

  @IsOptional()
  @IsBoolean()
  reRegister?: boolean;
}
