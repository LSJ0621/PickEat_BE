import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdatePreferencesDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  likes?: string[]; // 좋아하는 것

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dislikes?: string[]; // 싫어하는 것
}
