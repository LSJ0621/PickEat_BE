import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class PopularMenuQueryDto {
  @IsEnum(['recommended', 'selected'])
  type: 'recommended' | 'selected';

  @IsOptional()
  @IsEnum(['7d', '30d', 'all'])
  period?: '7d' | '30d' | 'all' = '30d';

  @IsOptional()
  @IsEnum(['breakfast', 'lunch', 'dinner', 'etc'])
  slot?: 'breakfast' | 'lunch' | 'dinner' | 'etc';

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
