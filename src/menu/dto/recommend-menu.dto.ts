import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class RecommendMenuLocationDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

export class RecommendMenuDto {
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @IsOptional()
  @IsString()
  requestAddress?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendMenuLocationDto)
  requestLocation?: RecommendMenuLocationDto;
}
