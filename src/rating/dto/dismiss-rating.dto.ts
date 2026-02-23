import { IsInt, IsPositive } from 'class-validator';

export class DismissRatingDto {
  @IsInt()
  @IsPositive()
  placeRatingId: number;
}
