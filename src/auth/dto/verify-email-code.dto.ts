import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { EmailPurpose } from './send-email-code.dto';

export class VerifyEmailCodeDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code: string;

  @IsOptional()
  @IsEnum(EmailPurpose)
  purpose?: EmailPurpose;
}
