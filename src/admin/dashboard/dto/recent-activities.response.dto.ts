export class RecentActivitiesResponseDto {
  recentUsers: Array<{
    id: number;
    email: string;
    socialType: string | null;
    createdAt: string;
  }>;
  recentBugReports: Array<{
    id: number;
    title: string;
    category: string;
    createdAt: string;
  }>;
  recentDeletedUsers: Array<{
    id: number;
    email: string;
    deletedAt: string;
  }>;
}
