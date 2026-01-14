import { IsEnum, IsOptional } from 'class-validator';

export class SearchRegionsQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d' = '30d';
}
