export class DashboardSummaryResponseDto {
  today: {
    newUsers: number;
    menuRecommendations: number;
    bugReports: number;
  };
  total: {
    users: number;
    menuRecommendations: number;
    bugReports: number;
  };
  pending: {
    unconfirmedBugReports: number;
    urgentBugReports: number;
  };
}
