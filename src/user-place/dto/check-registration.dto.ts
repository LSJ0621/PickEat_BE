import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CheckRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsLatitude()
  @IsNotEmpty()
  latitude: number;

  @IsLongitude()
  @IsNotEmpty()
  longitude: number;
}
