import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { EmailPurpose } from './send-email-code.dto';

export class VerifyEmailCodeDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsOptional()
  @IsEnum(EmailPurpose)
  purpose?: EmailPurpose;
}
