import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Birth year must be an integer' })
  @Min(1900, { message: 'Birth year must be 1900 or later' })
  @Max(new Date().getFullYear(), {
    message: 'Birth year cannot be in the future',
  })
  birthYear?: number;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'], {
    message: 'Gender must be male, female, or other',
  })
  gender?: 'male' | 'female' | 'other';
}
