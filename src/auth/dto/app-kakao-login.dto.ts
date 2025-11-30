import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AppKakaoLoginDto {
  @IsString()
  accessToken: string;

  @IsOptional()
  @IsBoolean()
  reRegister?: boolean;
}
