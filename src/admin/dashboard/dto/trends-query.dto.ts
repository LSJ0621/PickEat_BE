import { IsEnum, IsOptional } from 'class-validator';

export class TrendsQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d' = '7d';

  @IsOptional()
  @IsEnum(['users', 'recommendations', 'all'])
  type?: 'users' | 'recommendations' | 'all' = 'all';
}
