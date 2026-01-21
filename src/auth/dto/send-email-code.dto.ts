import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { IsLanguage } from '@/common/validators/language.validator';

export enum EmailPurpose {
  SIGNUP = 'SIGNUP',
  RESET_PASSWORD = 'RESET_PASSWORD',
  RE_REGISTER = 'RE_REGISTER',
}

export class SendEmailCodeDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(EmailPurpose)
  purpose?: EmailPurpose;

  @IsOptional()
  @IsString()
  @IsLanguage()
  lang?: 'ko' | 'en';
}
