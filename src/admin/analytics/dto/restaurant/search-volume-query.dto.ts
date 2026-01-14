import { IsEnum, IsOptional } from 'class-validator';

export class SearchVolumeQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d', '90d'])
  period?: '7d' | '30d' | '90d' = '30d';

  @IsOptional()
  @IsEnum(['places', 'blogs', 'all'])
  type?: 'places' | 'blogs' | 'all' = 'all';
}
