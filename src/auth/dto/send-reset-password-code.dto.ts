import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendResetPasswordCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
