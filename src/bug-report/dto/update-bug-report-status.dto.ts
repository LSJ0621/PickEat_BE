import { IsEnum } from 'class-validator';
import { BugReportStatus } from '../enum/bug-report-status.enum';

export class UpdateBugReportStatusDto {
  @IsEnum(BugReportStatus, {
    message: 'VALIDATION_INVALID_ENUM:status',
  })
  status: BugReportStatus;
}
