import { IsInt, Max, Min } from 'class-validator';

export class SubmitRatingDto {
  @IsInt()
  @Min(1)
  placeRatingId: number;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;
}
