import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RedirectDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsBoolean()
  reRegister?: boolean;
}
