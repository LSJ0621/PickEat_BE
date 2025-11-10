import { IsNotEmpty, IsString } from 'class-validator';

export class RecommendMenuDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;
}
