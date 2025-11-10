import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdatePreferencesDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
