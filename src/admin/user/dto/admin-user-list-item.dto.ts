export class AdminUserListItemDto {
  id: number;
  email: string;
  name: string | null;
  socialType: string | null;
  createdAt: Date;
  status: 'active' | 'deleted' | 'deactivated';
}
