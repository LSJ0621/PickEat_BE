export class AdminBugReportDetailDto {
  id: number;
  category: string;
  title: string;
  description: string;
  images: string[] | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: number;
    email: string;
    name: string | null;
    createdAt: Date;
  };
  statusHistory: Array<{
    id: string;
    previousStatus: string;
    status: string;
    changedAt: Date;
    changedBy: {
      id: number;
      email: string;
    };
  }>;
  adminNotes: Array<{
    id: string;
    content: string;
    createdAt: Date;
    createdBy: {
      id: number;
      email: string;
    };
  }>;
}
