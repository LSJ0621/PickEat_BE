export class AdminBugReportDetailDto {
  id: number;
  category: string;
  title: string;
  description: string;
  images: string[] | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    email: string;
    name: string | null;
    createdAt: string;
  };
  statusHistory: Array<{
    id: string;
    previousStatus: string;
    status: string;
    changedAt: string;
    changedBy: {
      id: number;
      email: string;
    } | null;
  }>;
}
