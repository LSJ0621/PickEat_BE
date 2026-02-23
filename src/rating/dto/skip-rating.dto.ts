import { IsInt } from 'class-validator';

export class SkipRatingDto {
  @IsInt()
  placeRatingId: number;
}
