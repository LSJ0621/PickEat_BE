import { IsString } from 'class-validator';

export class AppKakaoLoginDto {
  @IsString()
  accessToken: string;
}

