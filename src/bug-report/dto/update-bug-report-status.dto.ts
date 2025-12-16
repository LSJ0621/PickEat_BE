import { IsEnum } from 'class-validator';
import { BugReportStatus } from '../enum/bug-report-status.enum';

export class UpdateBugReportStatusDto {
  @IsEnum(BugReportStatus, { message: '상태는 UNCONFIRMED 또는 CONFIRMED여야 합니다.' })
  status: BugReportStatus;
}

