import { Role } from '@/common/constants/roles.constants';

export class AdminListItemDto {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  lastLoginAt: Date | null;
  createdAt: Date;
}
