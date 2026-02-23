import { IsEmail, IsEnum, IsOptional, MaxLength } from 'class-validator';

export enum EmailPurpose {
  SIGNUP = 'SIGNUP',
  RESET_PASSWORD = 'RESET_PASSWORD',
  RE_REGISTER = 'RE_REGISTER',
}

export class SendEmailCodeDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsEnum(EmailPurpose)
  purpose?: EmailPurpose;
}
