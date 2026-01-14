import { IsEnum, IsOptional, IsString } from 'class-validator';

export class MenuTrendsQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d', '90d', '1y'])
  period?: '7d' | '30d' | '90d' | '1y' = '30d';

  @IsOptional()
  @IsString()
  startDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  endDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month' = 'day';
}
