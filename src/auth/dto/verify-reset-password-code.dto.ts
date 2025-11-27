import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyResetPasswordCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
