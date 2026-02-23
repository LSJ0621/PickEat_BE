import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyResetPasswordCodeDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;
}
