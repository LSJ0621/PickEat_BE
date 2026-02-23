import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class SearchRestaurantsDto {
  @IsString()
  @IsNotEmpty()
  menuName: string;

  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeRoadAddress?: boolean;
}
