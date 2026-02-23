import { Role } from '@/common/constants/roles.constants';

export class AdminListItemDto {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  lastLoginAt: string | null;
  createdAt: string;
}
