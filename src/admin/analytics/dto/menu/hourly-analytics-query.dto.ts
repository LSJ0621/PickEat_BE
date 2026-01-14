import { IsEnum, IsOptional } from 'class-validator';

export class HourlyAnalyticsQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d'])
  period?: '7d' | '30d' = '30d';
}
