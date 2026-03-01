import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { ROLES, Role } from '@/common/constants/roles.constants';
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { AdminAuditLog } from '@/admin/settings/entities/admin-audit-log.entity';
import { AUDIT_ACTIONS } from '@/admin/settings/constants/audit-action.constants';
import { PaginatedResponse } from '@/common/interfaces/pagination.interface';
import { AdminUserListQueryDto } from './dto/admin-user-list-query.dto';
import { AdminUserListItemDto } from './dto/admin-user-list-item.dto';
import { AdminUserDetailDto } from './dto/admin-user-detail.dto';

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserAddress)
    private readonly addressRepository: Repository<UserAddress>,
    @InjectRepository(MenuRecommendation)
    private readonly menuRecommendationRepository: Repository<MenuRecommendation>,
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    @InjectRepository(BugReport)
    private readonly bugReportRepository: Repository<BugReport>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogRepository: Repository<AdminAuditLog>,
  ) {}

  async findAll(
    query: AdminUserListQueryDto,
    requestUserRole: Role,
  ): Promise<PaginatedResponse<AdminUserListItemDto>> {
    const qb = this.userRepository.createQueryBuilder('user');
    qb.withDeleted();

    // ADMIN인 경우 USER만 조회 가능
    if (requestUserRole === ROLES.ADMIN) {
      qb.andWhere('user.role = :role', { role: ROLES.USER });
    } else if (query.role) {
      // SUPER_ADMIN은 role 파라미터로 필터링 가능
      qb.andWhere('user.role = :role', { role: query.role });
    }

    // 검색 조건
    if (query.search) {
      qb.andWhere('(user.email ILIKE :search OR user.name ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    // 상태 필터
    if (query.status) {
      switch (query.status) {
        case 'active':
          qb.andWhere('user.deletedAt IS NULL AND user.isDeactivated = false');
          break;
        case 'deleted':
          qb.andWhere('user.deletedAt IS NOT NULL');
          break;
        case 'deactivated':
          qb.andWhere('user.isDeactivated = true AND user.deletedAt IS NULL');
          break;
      }
    }

    // socialType 필터
    if (query.socialType) {
      qb.andWhere('user.socialType = :socialType', {
        socialType: query.socialType,
      });
    }

    // 기간 필터
    if (query.startDate) {
      qb.andWhere('user.createdAt >= :startDate', {
        startDate: query.startDate,
      });
    }
    if (query.endDate) {
      qb.andWhere('user.createdAt <= :endDate', {
        endDate: `${query.endDate} 23:59:59`,
      });
    }

    // 정렬 - SQL Injection 방지를 위한 whitelist
    const ALLOWED_SORT_COLUMNS: Record<string, string> = {
      createdAt: 'user.createdAt',
      lastActiveAt: 'user.lastActiveAt',
      name: 'user.name',
      email: 'user.email',
    };
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'DESC';
    const column = ALLOWED_SORT_COLUMNS[sortBy] ?? 'user.createdAt';
    qb.orderBy(column, sortOrder);

    // 페이지네이션
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    qb.skip((page - 1) * limit).take(limit);

    const [items, totalCount] = await qb.getManyAndCount();

    return {
      items: items.map((user) => this.toListItemDto(user)),
      pageInfo: {
        page,
        limit,
        totalCount,
        hasNext: page * limit < totalCount,
      },
    };
  }

  async findOne(id: number): Promise<AdminUserDetailDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!user) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADMIN_USER_NOT_FOUND,
      });
    }

    const [addresses, stats, recentRecommendations, recentBugReports] =
      await Promise.all([
        this.addressRepository.find({
          where: { user: { id } },
          withDeleted: true,
        }),
        this.getUserStats(id),
        this.menuRecommendationRepository.find({
          where: { user: { id } },
          order: { createdAt: 'DESC' },
          take: 5,
        }),
        this.bugReportRepository.find({
          where: { user: { id } },
          order: { createdAt: 'DESC' },
          take: 5,
        }),
      ]);

    return this.toDetailDto(
      user,
      addresses,
      stats,
      recentRecommendations,
      recentBugReports,
    );
  }

  async deactivate(
    id: number,
    requestUserId: number,
    requestUserRole: Role,
    ipAddress: string,
  ): Promise<void> {
    // 자기 자신 비활성화 방지
    if (id === requestUserId) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADMIN_SELF_DEACTIVATION,
      });
    }

    // 대상 사용자 조회
    const targetUser = await this.userRepository.findOneBy({ id });
    if (!targetUser) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADMIN_USER_NOT_FOUND,
      });
    }

    // SUPER_ADMIN 비활성화 방지
    if (targetUser.role === ROLES.SUPER_ADMIN) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ADMIN_CANNOT_MODIFY_SUPER_ADMIN,
      });
    }

    // ADMIN은 USER만 비활성화 가능
    if (requestUserRole === ROLES.ADMIN && targetUser.role !== ROLES.USER) {
      throw new ForbiddenException({
        errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      });
    }

    const result = await this.userRepository.update(
      { id, isDeactivated: false },
      { isDeactivated: true, deactivatedAt: new Date(), refreshToken: null },
    );

    if (result.affected === 0) {
      throw new ConflictException({
        errorCode: ErrorCode.ADMIN_USER_ALREADY_DEACTIVATED,
      });
    }

    // 감사 로그 생성
    await this.auditLogRepository.save({
      adminId: requestUserId,
      action: AUDIT_ACTIONS.DEACTIVATE_USER,
      target: `User ID: ${id} (${targetUser.email})`,
      previousValue: { isDeactivated: false },
      newValue: { isDeactivated: true },
      ipAddress,
    });
  }

  async activate(
    id: number,
    requestUserId: number,
    requestUserRole: Role,
    ipAddress: string,
  ): Promise<void> {
    // 자기 자신 활성화 방지
    if (id === requestUserId) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADMIN_SELF_ACTIVATION,
      });
    }

    // 대상 사용자 조회
    const targetUser = await this.userRepository.findOneBy({ id });
    if (!targetUser) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADMIN_USER_NOT_FOUND,
      });
    }

    // SUPER_ADMIN 활성화 방지
    if (targetUser.role === ROLES.SUPER_ADMIN) {
      throw new ForbiddenException({
        errorCode: ErrorCode.ADMIN_CANNOT_MODIFY_SUPER_ADMIN,
      });
    }

    // ADMIN은 USER만 활성화 가능
    if (requestUserRole === ROLES.ADMIN && targetUser.role !== ROLES.USER) {
      throw new ForbiddenException({
        errorCode: ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      });
    }

    const result = await this.userRepository.update(
      { id, isDeactivated: true },
      { isDeactivated: false, deactivatedAt: null },
    );

    if (result.affected === 0) {
      throw new ConflictException({
        errorCode: ErrorCode.ADMIN_USER_ALREADY_ACTIVATED,
      });
    }

    // 감사 로그 생성
    await this.auditLogRepository.save({
      adminId: requestUserId,
      action: AUDIT_ACTIONS.ACTIVATE_USER,
      target: `User ID: ${id} (${targetUser.email})`,
      previousValue: { isDeactivated: true },
      newValue: { isDeactivated: false },
      ipAddress,
    });
  }

  private async getUserStats(userId: number): Promise<{
    menuRecommendations: number;
    menuSelections: number;
    bugReports: number;
  }> {
    const [menuRecommendations, menuSelections, bugReports] = await Promise.all(
      [
        this.menuRecommendationRepository.count({
          where: { user: { id: userId } },
        }),
        this.menuSelectionRepository.count({
          where: { user: { id: userId } },
        }),
        this.bugReportRepository.count({
          where: { user: { id: userId } },
        }),
      ],
    );

    return { menuRecommendations, menuSelections, bugReports };
  }

  private toListItemDto(user: User): AdminUserListItemDto {
    let status: 'active' | 'deleted' | 'deactivated' = 'active';
    if (user.deletedAt) {
      status = 'deleted';
    } else if (user.isDeactivated) {
      status = 'deactivated';
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      socialType: user.socialType,
      createdAt: user.createdAt.toISOString(),
      status,
    };
  }

  private toDetailDto(
    user: User,
    addresses: UserAddress[],
    stats: {
      menuRecommendations: number;
      menuSelections: number;
      bugReports: number;
    },
    recentRecommendations: MenuRecommendation[],
    recentBugReports: BugReport[],
  ): AdminUserDetailDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      socialType: user.socialType,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
      isDeactivated: user.isDeactivated,
      role: user.role as Role,
      preferences: user.preferences
        ? {
            likes: user.preferences.likes,
            dislikes: user.preferences.dislikes,
          }
        : null,
      addresses: addresses.map((addr) => ({
        id: addr.id,
        alias: addr.alias,
        roadAddress: addr.roadAddress,
        isDefault: addr.isDefault,
        isSearchAddress: addr.isSearchAddress,
      })),
      stats,
      recentActivities: {
        recommendations: recentRecommendations.map((rec) => ({
          id: rec.id,
          recommendations: rec.recommendations,
          requestAddress: rec.requestAddress,
          createdAt: rec.createdAt.toISOString(),
        })),
        bugReports: recentBugReports.map((bug) => ({
          id: bug.id,
          title: bug.title,
          category: bug.category,
          status: bug.status,
          createdAt: bug.createdAt.toISOString(),
        })),
      },
    };
  }
}
