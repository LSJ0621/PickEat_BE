export class AdminUserListItemDto {
  id: number;
  email: string;
  name: string | null;
  socialType: string | null;
  createdAt: string;
  status: 'active' | 'deleted' | 'deactivated';
}
