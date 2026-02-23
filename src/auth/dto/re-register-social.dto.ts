import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class ReRegisterSocialDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;
}
