import { IsEnum, IsInt, IsPositive } from 'class-validator';
import { ROLES } from '@/common/constants/roles.constants';

const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

export class PromoteAdminDto {
  @IsInt()
  @IsPositive()
  userId: number;

  @IsEnum(ADMIN_ROLES)
  role: AdminRole;
}
