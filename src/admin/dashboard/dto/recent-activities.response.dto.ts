export class RecentActivitiesResponseDto {
  recentUsers: Array<{
    id: number;
    email: string;
    socialType: string | null;
    createdAt: Date;
  }>;
  recentBugReports: Array<{
    id: number;
    title: string;
    category: string;
    createdAt: Date;
  }>;
  recentDeletedUsers: Array<{
    id: number;
    email: string;
    deletedAt: Date;
  }>;
}
