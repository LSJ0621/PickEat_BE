import { IsOptional, IsInt, Min, Max, IsEnum, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { BugReportStatus } from '../enum/bug-report-status.enum';

export class BugReportListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '페이지는 정수여야 합니다.' })
  @Min(1, { message: '페이지는 1 이상이어야 합니다.' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit는 정수여야 합니다.' })
  @Min(1, { message: 'limit는 1 이상이어야 합니다.' })
  @Max(50, { message: 'limit는 최대 50까지 가능합니다.' })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(BugReportStatus, {
    message: '상태는 UNCONFIRMED 또는 CONFIRMED여야 합니다.',
  })
  status?: BugReportStatus;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: '날짜는 YYYY-MM-DD 형식이어야 합니다.',
  })
  date?: string; // 특정 날짜 필터 (YYYY-MM-DD)
}
