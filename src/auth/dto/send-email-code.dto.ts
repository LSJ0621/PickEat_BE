import { IsEmail, IsEnum, IsOptional } from 'class-validator';

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
}
