export class BugReportStatisticsDto {
  byStatus: {
    UNCONFIRMED: number;
    CONFIRMED: number;
    FIXED: number;
    CLOSED: number;
  };
  byCategory: {
    BUG: number;
    INQUIRY: number;
    OTHER: number;
  };
  processingTime: {
    averageHours: number;
    pendingAverageHours: number;
  };
}
