import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { BugReportStatus } from '@/bug-report/enum/bug-report-status.enum';
import { DashboardSummaryResponseDto } from './dto/dashboard-summary.response.dto';
import { RecentActivitiesResponseDto } from './dto/recent-activities.response.dto';
import { TrendsQueryDto } from './dto/trends-query.dto';
import { TrendsResponseDto } from './dto/trends.response.dto';

interface DailyTrendItem {
  date: string;
  count: number;
}

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MenuRecommendation)
    private readonly menuRecommendationRepository: Repository<MenuRecommendation>,
    @InjectRepository(BugReport)
    private readonly bugReportRepository: Repository<BugReport>,
  ) {}

  async getSummary(): Promise<DashboardSummaryResponseDto> {
    const today = this.getKSTToday();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const [
      todayUsers,
      todayRecommendations,
      todayBugReports,
      totalUsers,
      totalRecommendations,
      totalBugReports,
      unconfirmedBugReports,
      urgentBugReports,
    ] = await Promise.all([
      this.userRepository.count({
        where: { createdAt: MoreThanOrEqual(today) },
      }),
      this.menuRecommendationRepository.count({
        where: { createdAt: MoreThanOrEqual(today) },
      }),
      this.bugReportRepository.count({
        where: { createdAt: MoreThanOrEqual(today) },
      }),
      this.userRepository.count(),
      this.menuRecommendationRepository.count(),
      this.bugReportRepository.count(),
      this.bugReportRepository.count({
        where: { status: BugReportStatus.UNCONFIRMED },
      }),
      this.bugReportRepository.count({
        where: {
          status: BugReportStatus.UNCONFIRMED,
          createdAt: LessThanOrEqual(threeDaysAgo),
        },
      }),
    ]);

    return {
      today: {
        newUsers: todayUsers,
        menuRecommendations: todayRecommendations,
        bugReports: todayBugReports,
      },
      total: {
        users: totalUsers,
        menuRecommendations: totalRecommendations,
        bugReports: totalBugReports,
      },
      pending: {
        unconfirmedBugReports,
        urgentBugReports,
      },
    };
  }

  async getRecentActivities(): Promise<RecentActivitiesResponseDto> {
    const [recentUsers, recentBugReports, recentDeletedUsers] =
      await Promise.all([
        this.userRepository.find({
          order: { createdAt: 'DESC' },
          take: 5,
        }),
        this.bugReportRepository.find({
          order: { createdAt: 'DESC' },
          take: 5,
        }),
        this.userRepository.find({
          withDeleted: true,
          where: { deletedAt: Not(IsNull()) },
          order: { deletedAt: 'DESC' },
          take: 5,
        }),
      ]);

    return {
      recentUsers: recentUsers.map((user) => ({
        id: user.id,
        email: user.email,
        socialType: user.socialType,
        createdAt: user.createdAt,
      })),
      recentBugReports: recentBugReports.map((bugReport) => ({
        id: bugReport.id,
        title: bugReport.title,
        category: bugReport.category,
        createdAt: bugReport.createdAt,
      })),
      recentDeletedUsers: recentDeletedUsers.map((user) => ({
        id: user.id,
        email: user.email,
        deletedAt: user.deletedAt!,
      })),
    };
  }

  async getTrends(query: TrendsQueryDto): Promise<TrendsResponseDto> {
    const days = query.period === '7d' ? 7 : query.period === '30d' ? 30 : 90;
    const startDate = this.getKSTToday();
    startDate.setDate(startDate.getDate() - days);

    const result: TrendsResponseDto = {
      users: [],
      recommendations: [],
    };

    if (query.type === 'all' || query.type === 'users') {
      result.users = await this.getUserDailyTrend(startDate, days);
    }

    if (query.type === 'all' || query.type === 'recommendations') {
      result.recommendations = await this.getRecommendationDailyTrend(
        startDate,
        days,
      );
    }

    return result;
  }

  private async getUserDailyTrend(
    startDate: Date,
    days: number,
  ): Promise<DailyTrendItem[]> {
    const rawResults = await this.userRepository
      .createQueryBuilder('user')
      .select('DATE(user.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('user.createdAt >= :startDate', { startDate })
      .groupBy('DATE(user.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; count: string }>();

    return this.fillMissingDates(rawResults, startDate, days);
  }

  private async getRecommendationDailyTrend(
    startDate: Date,
    days: number,
  ): Promise<DailyTrendItem[]> {
    const rawResults = await this.menuRecommendationRepository
      .createQueryBuilder('menurecommendation')
      .select('DATE(menurecommendation.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('menurecommendation.createdAt >= :startDate', { startDate })
      .groupBy('DATE(menurecommendation.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; count: string }>();

    return this.fillMissingDates(rawResults, startDate, days);
  }

  private fillMissingDates(
    rawResults: Array<{ date: string; count: string }>,
    startDate: Date,
    days: number,
  ): DailyTrendItem[] {
    const resultMap = new Map<string, number>();
    for (const row of rawResults) {
      const dateValue = row.date;
      const dateStr =
        typeof dateValue === 'object' && dateValue !== null
          ? (dateValue as unknown as Date).toISOString().split('T')[0]
          : String(dateValue).split('T')[0];
      resultMap.set(dateStr, parseInt(row.count, 10));
    }

    const trendData: DailyTrendItem[] = [];
    const currentDate = new Date(startDate);
    for (let i = 0; i <= days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      trendData.push({
        date: dateStr,
        count: resultMap.get(dateStr) ?? 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return trendData;
  }

  private getKSTToday(): Date {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    kstDate.setUTCHours(0, 0, 0, 0);
    return new Date(kstDate.getTime() - kstOffset);
  }
}
