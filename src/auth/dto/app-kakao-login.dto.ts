import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AppKakaoLoginDto {
  @IsString()
  @MaxLength(500)
  accessToken: string;

  @IsOptional()
  @IsBoolean()
  reRegister?: boolean;
}
