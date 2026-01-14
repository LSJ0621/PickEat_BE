import { ArrayMinSize, IsArray, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { BugReportStatus } from '../enum/bug-report-status.enum';

export class BatchUpdateStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Type(() => Number)
  ids: number[];

  @IsEnum(BugReportStatus)
  status: BugReportStatus;
}
