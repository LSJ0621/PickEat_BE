import { Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RecommendPlacesV2Dto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  menuName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsLatitude()
  @Type(() => Number)
  latitude: number;

  @IsLongitude()
  @Type(() => Number)
  longitude: number;

  @IsNumber()
  @Type(() => Number)
  menuRecommendationId: number;

  @IsOptional()
  @IsIn(['ko', 'en'])
  language?: 'ko' | 'en';
}
