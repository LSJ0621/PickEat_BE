import {
  IsOptional,
  Matches,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecommendationHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0) // 최소값: 0 (신규 유저는 이력이 없을 수 있음)
  @Max(10) // 최대값: 10 (페이지당 최대 10개 제한)
  limit?: number = 10;

  @IsOptional()
  @MaxLength(10)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  date?: string;
}
