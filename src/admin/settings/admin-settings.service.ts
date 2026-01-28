import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { ADMIN_ROLES, Role, ROLES } from '@/common/constants/roles.constants';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AdminListItemDto } from './dto/admin-list-item.dto';
import { AUDIT_ACTIONS } from './constants/audit-action.constants';

@Injectable()
export class AdminSettingsService {
  private readonly logger = new Logger(AdminSettingsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogRepository: Repository<AdminAuditLog>,
  ) {}

  /**
   * Get list of all admin users
   */
  async getAdminList(): Promise<AdminListItemDto[]> {
    const admins = await this.userRepository.find({
      where: { role: In([...ADMIN_ROLES]) },
      order: { createdAt: 'DESC' },
    });

    return admins.map((admin) => ({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role as Role,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    }));
  }

  /**
   * Promote a user to admin or super admin role
   */
  async promoteToAdmin(
    userId: number | undefined,
    email: string | undefined,
    role: Role,
    currentAdmin: User,
    ipAddress: string,
  ): Promise<void> {
    if (!userId && !email) {
      throw new BadRequestException('Either userId or email must be provided');
    }

    if (userId && email) {
      throw new BadRequestException(
        'Provide only one identifier: userId or email, not both',
      );
    }

    const user = await this.userRepository.findOne({
      where: userId ? { id: userId } : { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === role) {
      throw new BadRequestException(`User is already ${role}`);
    }

    const previousRole = user.role;
    user.role = role;
    await this.userRepository.save(user);

    await this.createAuditLog({
      adminId: currentAdmin.id,
      action: AUDIT_ACTIONS.PROMOTE_ADMIN,
      target: `user:${user.id}`,
      previousValue: { role: previousRole },
      newValue: { role },
      ipAddress,
    });

    this.logger.log(
      `Admin ${currentAdmin.email} promoted user ${user.email} from ${previousRole} to ${role}`,
    );
  }

  /**
   * Demote an admin back to regular user
   */
  async demoteAdmin(
    userId: number,
    currentAdmin: User,
    ipAddress: string,
  ): Promise<void> {
    if (userId === currentAdmin.id) {
      throw new ForbiddenException('Cannot remove your own admin role');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === ROLES.USER) {
      throw new BadRequestException('User is not an admin');
    }

    if (user.role === ROLES.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN 역할은 강등할 수 없습니다');
    }

    const previousRole = user.role;
    user.role = ROLES.USER;
    await this.userRepository.save(user);

    await this.createAuditLog({
      adminId: currentAdmin.id,
      action: AUDIT_ACTIONS.DEMOTE_ADMIN,
      target: `user:${userId}`,
      previousValue: { role: previousRole },
      newValue: { role: ROLES.USER },
      ipAddress,
    });

    this.logger.log(
      `Admin ${currentAdmin.email} demoted user ${user.email} from ${previousRole} to USER`,
    );
  }

  /**
   * Create an audit log entry
   */
  private async createAuditLog(params: {
    adminId: number;
    action: string;
    target: string | null;
    previousValue: Record<string, unknown> | null;
    newValue: Record<string, unknown> | null;
    ipAddress: string;
  }): Promise<void> {
    const auditLog = this.auditLogRepository.create({
      adminId: params.adminId,
      action: params.action,
      target: params.target,
      previousValue: params.previousValue,
      newValue: params.newValue,
      ipAddress: params.ipAddress,
    });

    await this.auditLogRepository.save(auditLog);
  }
}
