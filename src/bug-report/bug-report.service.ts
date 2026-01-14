import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuthUserPayload } from '../auth/decorators/current-user.decorator';
import {
  PageInfo,
  PaginatedResponse,
} from '../common/interfaces/pagination.interface';
import { S3Client } from '../external/aws/clients/s3.client';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { AdminBugReportDetailDto } from './dto/admin-bug-report-detail.dto';
import { BugReportListQueryDto } from './dto/bug-report-list-query.dto';
import { BugReportStatisticsDto } from './dto/bug-report-statistics.dto';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { BugReportAdminNote } from './entities/bug-report-admin-note.entity';
import { BugReportStatusHistory } from './entities/bug-report-status-history.entity';
import { BugReport } from './entities/bug-report.entity';
import { BugReportStatus } from './enum/bug-report-status.enum';

@Injectable()
export class BugReportService {
  private readonly logger = new Logger(BugReportService.name);

  constructor(
    @InjectRepository(BugReport)
    private readonly bugReportRepository: Repository<BugReport>,
    @InjectRepository(BugReportStatusHistory)
    private readonly statusHistoryRepo: Repository<BugReportStatusHistory>,
    @InjectRepository(BugReportAdminNote)
    private readonly adminNoteRepo: Repository<BugReportAdminNote>,
    private readonly userService: UserService,
    private readonly s3Client: S3Client,
    private readonly dataSource: DataSource,
  ) {}

  async createBugReport(
    authUser: AuthUserPayload,
    dto: CreateBugReportDto,
    files: Express.Multer.File[],
  ): Promise<BugReport> {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);

    // 이미지 업로드 (최대 5장) - S3 URL만 저장
    const imageUrls: string[] | null =
      files && files.length > 0
        ? await Promise.all(
            files.slice(0, 5).map(async (file) => {
              const url = await this.s3Client.uploadBugReportImage(file);
              return url;
            }),
          )
        : null;

    const bugReport = this.bugReportRepository.create({
      user: user,
      category: dto.category,
      title: dto.title,
      description: dto.description,
      images: imageUrls,
    });

    return await this.bugReportRepository.save(bugReport);
  }

  /**
   * 관리자용 버그 제보 목록 조회 (Pagination + 필터)
   */
  async findAll(
    queryDto: BugReportListQueryDto,
  ): Promise<PaginatedResponse<BugReport>> {
    const { page = 1, limit = 20, status, date, category, search } = queryDto;

    const qb = this.bugReportRepository
      .createQueryBuilder('bugReport')
      .leftJoinAndSelect('bugReport.user', 'user')
      .orderBy('bugReport.createdAt', 'DESC');

    if (status !== undefined) {
      qb.andWhere('bugReport.status = :status', { status });
    }

    // 날짜 필터
    if (date) {
      const { start, end } = this.calculateDateRange(date);
      qb.andWhere('bugReport.createdAt >= :start', { start });
      qb.andWhere('bugReport.createdAt < :end', { end });
    }

    // 카테고리 필터
    if (category) {
      qb.andWhere('bugReport.category = :category', { category });
    }

    // 검색 필터 (제목 또는 설명에서 검색)
    if (search) {
      qb.andWhere(
        '(bugReport.title ILIKE :search OR bugReport.description ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [items, totalCount] = await qb.getManyAndCount();

    const hasNext = skip + items.length < totalCount;

    const pageInfo: PageInfo = {
      page,
      limit,
      totalCount,
      hasNext,
    };

    return { items, pageInfo };
  }

  /**
   * 관리자용 버그 제보 상세 조회
   */
  async findOne(id: number): Promise<BugReport> {
    const bugReport = await this.bugReportRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!bugReport) {
      throw new NotFoundException(`버그 제보를 찾을 수 없습니다. (ID: ${id})`);
    }

    return bugReport;
  }

  /**
   * 관리자용 버그 제보 상태 변경
   */
  async updateStatus(id: number, status: BugReportStatus): Promise<BugReport> {
    const bugReport = await this.bugReportRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!bugReport) {
      throw new NotFoundException(`버그 제보를 찾을 수 없습니다. (ID: ${id})`);
    }

    // 상태 업데이트 (updatedAt은 자동으로 갱신됨)
    bugReport.status = status;
    return this.bugReportRepository.save(bugReport);
  }

  /**
   * 날짜 범위 계산 (YYYY-MM-DD 형식의 날짜를 시작일 00:00:00 ~ 종료일 23:59:59로 변환)
   */
  private calculateDateRange(date: string): { start: Date; end: Date } {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() + 1); // 다음날 00:00:00 전까지

    return { start, end };
  }

  /**
   * 관리자용 버그 제보 상태 변경 (이력 기록 포함)
   */
  async updateStatusWithHistory(
    id: number,
    status: BugReportStatus,
    changedBy: User,
  ): Promise<BugReport> {
    const bugReport = await this.findOne(id);
    const previousStatus = bugReport.status;

    bugReport.status = status;
    await this.bugReportRepository.save(bugReport);

    // 상태 변경 이력 기록
    await this.statusHistoryRepo.save({
      bugReport,
      previousStatus,
      status,
      changedBy,
    });

    return bugReport;
  }

  /**
   * 트랜잭션 내에서 버그 제보 상태 변경 (배치 작업용)
   */
  private async updateStatusWithHistoryInTransaction(
    manager: EntityManager,
    id: number,
    status: BugReportStatus,
    changedBy: User,
  ): Promise<void> {
    const bugReport = await manager.findOne(BugReport, {
      where: { id },
      relations: ['user'],
    });

    if (!bugReport) {
      throw new NotFoundException(`버그 제보를 찾을 수 없습니다. (ID: ${id})`);
    }

    const previousStatus = bugReport.status;
    bugReport.status = status;
    await manager.save(BugReport, bugReport);

    // 상태 변경 이력 기록
    await manager.save(BugReportStatusHistory, {
      bugReport,
      previousStatus,
      status,
      changedBy,
    });
  }

  /**
   * 관리자용 버그 제보 상세 조회 (이력, 메모 포함)
   */
  async findOneWithDetails(id: number): Promise<AdminBugReportDetailDto> {
    const bugReport = await this.bugReportRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!bugReport) {
      throw new NotFoundException('버그 리포트를 찾을 수 없습니다.');
    }

    const [statusHistory, adminNotes] = await Promise.all([
      this.statusHistoryRepo.find({
        where: { bugReport: { id } },
        relations: ['changedBy'],
        order: { changedAt: 'DESC' },
      }),
      this.adminNoteRepo.find({
        where: { bugReport: { id } },
        relations: ['createdBy'],
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      id: bugReport.id,
      category: bugReport.category,
      title: bugReport.title,
      description: bugReport.description,
      images: bugReport.images,
      status: bugReport.status,
      createdAt: bugReport.createdAt,
      updatedAt: bugReport.updatedAt,
      user: {
        id: bugReport.user.id,
        email: bugReport.user.email,
        name: bugReport.user.name,
        createdAt: bugReport.user.createdAt,
      },
      statusHistory: statusHistory.map((h) => ({
        id: h.id,
        previousStatus: h.previousStatus,
        status: h.status,
        changedAt: h.changedAt,
        changedBy: { id: h.changedBy.id, email: h.changedBy.email },
      })),
      adminNotes: adminNotes.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
        createdBy: { id: n.createdBy.id, email: n.createdBy.email },
      })),
    };
  }

  /**
   * 관리자 메모 추가
   */
  async addAdminNote(
    bugReportId: number,
    content: string,
    createdBy: User,
  ): Promise<BugReportAdminNote> {
    const bugReport = await this.findOne(bugReportId);
    return this.adminNoteRepo.save({ bugReport, content, createdBy });
  }

  /**
   * 일괄 상태 변경 (트랜잭션 적용)
   */
  async batchUpdateStatus(
    ids: number[],
    status: BugReportStatus,
    changedBy: User,
  ): Promise<{ updatedCount: number; failedIds: number[] }> {
    const failedIds: number[] = [];

    return await this.dataSource.transaction(async (manager) => {
      let updatedCount = 0;

      for (const id of ids) {
        try {
          await this.updateStatusWithHistoryInTransaction(
            manager,
            id,
            status,
            changedBy,
          );
          updatedCount++;
        } catch (error) {
          this.logger.warn(
            `Failed to update bug report ${id}: ${(error as Error).message}`,
          );
          failedIds.push(id);
        }
      }

      return { updatedCount, failedIds };
    });
  }

  /**
   * 통계 조회
   */
  async getStatistics(): Promise<BugReportStatisticsDto> {
    const qb = this.bugReportRepository.createQueryBuilder('br');

    // 상태별 집계
    const byStatusRaw: Array<{ status: string; count: string }> = await qb
      .select('br.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('br.status')
      .getRawMany();

    const byStatus = {
      UNCONFIRMED: 0,
      CONFIRMED: 0,
      FIXED: 0,
      CLOSED: 0,
    };
    byStatusRaw.forEach((r) => {
      if (r.status in byStatus) {
        byStatus[r.status as keyof typeof byStatus] = parseInt(r.count, 10);
      }
    });

    // 카테고리별 집계
    const byCategoryRaw: Array<{ category: string; count: string }> =
      await this.bugReportRepository
        .createQueryBuilder('br')
        .select('br.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .groupBy('br.category')
        .getRawMany();

    const byCategory = { BUG: 0, INQUIRY: 0, OTHER: 0 };
    byCategoryRaw.forEach((r) => {
      if (r.category in byCategory) {
        byCategory[r.category as keyof typeof byCategory] = parseInt(
          r.count,
          10,
        );
      }
    });

    return {
      byStatus,
      byCategory,
      processingTime: { averageHours: 0, pendingAverageHours: 0 },
    };
  }
}
