export class AdminUserDetailDto {
  id: number;
  email: string;
  name: string | null;
  socialType: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isDeactivated: boolean;
  preferences: {
    likes: string[];
    dislikes: string[];
  } | null;
  addresses: Array<{
    id: number;
    alias: string | null;
    roadAddress: string;
    isDefault: boolean;
    isSearchAddress: boolean;
  }>;
  stats: {
    menuRecommendations: number;
    menuSelections: number;
    bugReports: number;
  };
  recentActivities: {
    recommendations: Array<{
      id: number;
      recommendations: string[];
      requestAddress: string;
      createdAt: string;
    }>;
    bugReports: Array<{
      id: number;
      title: string;
      category: string;
      status: string;
      createdAt: string;
    }>;
  };
}
