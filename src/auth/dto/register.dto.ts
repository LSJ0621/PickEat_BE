import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Birth date must be in YYYY-MM-DD format',
  })
  birthDate: string;

  @IsEnum(['male', 'female', 'other'], {
    message: 'Gender must be male, female, or other',
  })
  @IsNotEmpty()
  gender: 'male' | 'female' | 'other';
}
