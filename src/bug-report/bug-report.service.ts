import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUserPayload } from '../auth/decorators/current-user.decorator';
import {
  PageInfo,
  PaginatedResponse,
} from '../common/interfaces/pagination.interface';
import { S3Client } from '../external/aws/clients/s3.client';
import { UserService } from '../user/user.service';
import { BugReportListQueryDto } from './dto/bug-report-list-query.dto';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { BugReport } from './entities/bug-report.entity';
import { BugReportStatus } from './enum/bug-report-status.enum';

@Injectable()
export class BugReportService {
  constructor(
    @InjectRepository(BugReport)
    private readonly bugReportRepository: Repository<BugReport>,
    private readonly userService: UserService,
    private readonly s3Client: S3Client,
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
    const { page = 1, limit = 20, status, date } = queryDto;

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
}
