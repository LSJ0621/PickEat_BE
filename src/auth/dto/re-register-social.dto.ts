import { IsEmail, IsNotEmpty } from 'class-validator';

export class ReRegisterSocialDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

