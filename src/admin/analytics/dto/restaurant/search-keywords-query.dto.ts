import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchKeywordsQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d'])
  period?: '7d' | '30d' = '30d';

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
