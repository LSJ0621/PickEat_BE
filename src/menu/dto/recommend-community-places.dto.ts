import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RecommendCommunityPlacesDto {
  @IsNumber()
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Type(() => Number)
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsString()
  @MaxLength(255)
  menuName: string;

  @IsNumber()
  @Type(() => Number)
  menuRecommendationId: number;

  @IsOptional()
  @IsIn(['ko', 'en'])
  language?: string;
}
