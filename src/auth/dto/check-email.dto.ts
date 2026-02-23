import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class CheckEmailDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;
}
