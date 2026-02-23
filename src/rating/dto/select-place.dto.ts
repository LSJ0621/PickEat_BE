import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SelectPlaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  placeId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  placeName: string;

  @IsOptional()
  @IsInt()
  placeRecommendationId?: number;
}
