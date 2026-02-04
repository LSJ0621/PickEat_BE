import { Type } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class RecommendPlacesV2Dto {
  @IsString()
  @IsNotEmpty()
  menuName: string;

  @IsString()
  @IsNotEmpty()
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
