import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class SendResetPasswordCodeDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;
}
