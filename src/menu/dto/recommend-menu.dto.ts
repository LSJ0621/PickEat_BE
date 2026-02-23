import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RecommendMenuDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt: string;
}
