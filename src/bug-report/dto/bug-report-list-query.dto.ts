import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  Matches,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BugReportStatus } from '../enum/bug-report-status.enum';

export class BugReportListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'VALIDATION_INT:page' })
  @Min(1, { message: 'VALIDATION_MIN:page:1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'VALIDATION_INT:limit' })
  @Min(1, { message: 'VALIDATION_MIN:limit:1' })
  @Max(50, { message: 'VALIDATION_MAX:limit:50' })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(BugReportStatus, {
    message: 'VALIDATION_INVALID_ENUM:status',
  })
  status?: BugReportStatus;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'VALIDATION_DATE_FORMAT:date',
  })
  date?: string; // 특정 날짜 필터 (YYYY-MM-DD)

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
