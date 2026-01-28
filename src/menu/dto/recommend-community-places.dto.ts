import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
  menuName: string;

  @IsNumber()
  @Type(() => Number)
  menuRecommendationId: number;

  @IsOptional()
  @IsString()
  language?: string;
}
