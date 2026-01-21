import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IsLanguage } from '@/common/validators/language.validator';

export class SendResetPasswordCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  @IsLanguage()
  lang?: 'ko' | 'en';
}
