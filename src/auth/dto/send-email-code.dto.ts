import { IsEmail, IsEnum, IsOptional } from 'class-validator';

export enum EmailPurpose {
  SIGNUP = 'SIGNUP',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

export class SendEmailCodeDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(EmailPurpose)
  purpose?: EmailPurpose;
}
