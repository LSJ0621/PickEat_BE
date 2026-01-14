import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ApiUsageLog } from '../entities/api-usage-log.entity';
import { EmailLog } from '../entities/email-log.entity';
import { MonitoringQueryDto } from '../dto/monitoring-query.dto';
import {
  ApiUsageResponseDto,
  OpenAiStats,
  GooglePlacesStats,
  GoogleCseStats,
  KakaoStats,
} from '../dto/api-usage-response.dto';
import { EmailStatsResponseDto } from '../dto/email-stats-response.dto';
import { StorageStatsResponseDto } from '../dto/storage-stats-response.dto';
import {
  API_PROVIDERS,
  GOOGLE_CSE_DAILY_QUOTA,
  MONITORING_PERIODS,
  OPENAI_PRICING,
} from '../monitoring.constants';
import { S3Client } from '@/external/aws/clients/s3.client';

interface DailyBreakdownRaw {
  date: string;
  count: string;
}

interface OpenAiDailyRaw {
  date: string;
  calls: string;
  tokens: string;
}

interface OpenAiByModelRaw {
  model: string;
  calls: string;
  tokens: string;
}

interface KakaoDailyRaw {
  date: string;
  localCalls: string;
  oauthCalls: string;
}

interface EmailDailyRaw {
  date: string;
  totalsent: string;
  successcount: string;
  failurecount: string;
}

interface EmailPurposeRaw {
  purpose: string;
  totalsent: string;
  successcount: string;
  failurecount: string;
}

@Injectable()
export class AdminMonitoringService {
  private readonly logger = new Logger(AdminMonitoringService.name);

  constructor(
    @InjectRepository(ApiUsageLog)
    private readonly apiUsageLogRepository: Repository<ApiUsageLog>,
    @InjectRepository(EmailLog)
    private readonly emailLogRepository: Repository<EmailLog>,
    private readonly s3Client: S3Client,
  ) {}

  /**
   * API 사용 통계를 조회합니다.
   */
  async getApiUsageStats(
    query: MonitoringQueryDto,
  ): Promise<ApiUsageResponseDto> {
    const days = MONITORING_PERIODS[query.period ?? '7d'];
    const startDate = this.getKSTStartDate(days);

    const [openai, googlePlaces, googleCse, kakao] = await Promise.all([
      this.getOpenAiStats(startDate, days),
      this.getGooglePlacesStats(startDate, days),
      this.getGoogleCseStats(startDate, days),
      this.getKakaoStats(startDate, days),
    ]);

    return {
      period: query.period ?? '7d',
      openai,
      googlePlaces,
      googleCse,
      kakao,
    };
  }

  /**
   * 이메일 통계를 조회합니다.
   */
  async getEmailStats(
    query: MonitoringQueryDto,
  ): Promise<EmailStatsResponseDto> {
    const days = MONITORING_PERIODS[query.period ?? '7d'];
    const startDate = this.getKSTStartDate(days);

    const [summaryData, byPurposeData, dailyData] = await Promise.all([
      this.getEmailSummary(startDate),
      this.getEmailByPurpose(startDate),
      this.getEmailDailyBreakdown(startDate, days),
    ]);

    return {
      period: query.period ?? '7d',
      summary: summaryData,
      byPurpose: byPurposeData,
      dailyBreakdown: dailyData,
    };
  }

  /**
   * 스토리지 통계를 조회합니다.
   */
  async getStorageStats(): Promise<StorageStatsResponseDto> {
    const bucketStats = await this.s3Client.getBucketStats();

    return {
      totalSizeBytes: bucketStats.totalSizeBytes,
      totalSizeMb:
        Math.round((bucketStats.totalSizeBytes / (1024 * 1024)) * 100) / 100,
      fileCount: bucketStats.fileCount,
      files: bucketStats.files,
    };
  }

  private async getOpenAiStats(
    startDate: Date,
    days: number,
  ): Promise<OpenAiStats> {
    const baseStats = await this.getProviderBaseStats(
      API_PROVIDERS.OPENAI,
      startDate,
    );

    // 토큰 및 비용 계산을 위한 쿼리
    const tokenStats = await this.apiUsageLogRepository
      .createQueryBuilder('log')
      .select('SUM(log.promptTokens)', 'totalPromptTokens')
      .addSelect('SUM(log.completionTokens)', 'totalCompletionTokens')
      .addSelect('SUM(log.totalTokens)', 'totalTokens')
      .where('log.provider = :provider', { provider: API_PROVIDERS.OPENAI })
      .andWhere('log.createdAt >= :startDate', { startDate })
      .getRawOne<{
        totalPromptTokens: string | null;
        totalCompletionTokens: string | null;
        totalTokens: string | null;
      }>();

    // 모델별 통계
    const byModelRaw = await this.apiUsageLogRepository
      .createQueryBuilder('log')
      .select('log.model', 'model')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('SUM(log.totalTokens)', 'tokens')
      .where('log.provider = :provider', { provider: API_PROVIDERS.OPENAI })
      .andWhere('log.createdAt >= :startDate', { startDate })
      .andWhere('log.model IS NOT NULL')
      .groupBy('log.model')
      .orderBy('calls', 'DESC')
      .getRawMany<OpenAiByModelRaw>();

    // 일별 통계
    const dailyRaw = await this.apiUsageLogRepository
      .createQueryBuilder('log')
      .select('DATE(log.createdAt)', 'date')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('SUM(log.totalTokens)', 'tokens')
      .where('log.provider = :provider', { provider: API_PROVIDERS.OPENAI })
      .andWhere('log.createdAt >= :startDate', { startDate })
      .groupBy('DATE(log.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<OpenAiDailyRaw>();

    const totalPromptTokens = parseInt(
      tokenStats?.totalPromptTokens ?? '0',
      10,
    );
    const totalCompletionTokens = parseInt(
      tokenStats?.totalCompletionTokens ?? '0',
      10,
    );
    const totalTokens = parseInt(tokenStats?.totalTokens ?? '0', 10);

    // 모델별 비용 계산
    const byModel = byModelRaw.map((row) => {
      const model = row.model || 'unknown';
      const calls = parseInt(row.calls, 10);
      const tokens = parseInt(row.tokens || '0', 10);
      const pricing = this.getModelPricing(model);
      // 대략적인 비용 추정 (input:output = 1:1 가정)
      const estimatedCostUsd =
        (tokens / 2 / 1_000_000) * pricing.input +
        (tokens / 2 / 1_000_000) * pricing.output;

      return {
        model,
        calls,
        tokens,
        estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
      };
    });

    const estimatedCostUsd = byModel.reduce(
      (sum, item) => sum + item.estimatedCostUsd,
      0,
    );

    return {
      ...baseStats,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
      byModel,
      dailyBreakdown: this.fillMissingDatesWithTokens(
        dailyRaw,
        startDate,
        days,
      ),
    };
  }

  private async getGooglePlacesStats(
    startDate: Date,
    days: number,
  ): Promise<GooglePlacesStats> {
    const baseStats = await this.getProviderBaseStats(
      API_PROVIDERS.GOOGLE_PLACES,
      startDate,
    );

    const dailyRaw = await this.getDailyBreakdown(
      API_PROVIDERS.GOOGLE_PLACES,
      startDate,
    );

    return {
      ...baseStats,
      dailyBreakdown: this.fillMissingDates(dailyRaw, startDate, days),
    };
  }

  private async getGoogleCseStats(
    startDate: Date,
    days: number,
  ): Promise<GoogleCseStats> {
    const baseStats = await this.getProviderBaseStats(
      API_PROVIDERS.GOOGLE_CSE,
      startDate,
    );

    // 오늘 사용량 계산
    const today = this.getKSTToday();
    const todayUsage = await this.apiUsageLogRepository.count({
      where: {
        provider: API_PROVIDERS.GOOGLE_CSE,
        createdAt: MoreThanOrEqual(today),
      },
    });

    const dailyRaw = await this.getDailyBreakdown(
      API_PROVIDERS.GOOGLE_CSE,
      startDate,
    );

    return {
      ...baseStats,
      dailyQuota: GOOGLE_CSE_DAILY_QUOTA,
      todayUsage,
      remainingQuota: Math.max(GOOGLE_CSE_DAILY_QUOTA - todayUsage, 0),
      dailyBreakdown: this.fillMissingDates(dailyRaw, startDate, days),
    };
  }

  private async getKakaoStats(
    startDate: Date,
    days: number,
  ): Promise<KakaoStats> {
    const [localStats, oauthStats] = await Promise.all([
      this.getProviderBaseStats(API_PROVIDERS.KAKAO_LOCAL, startDate),
      this.getProviderBaseStats(API_PROVIDERS.KAKAO_OAUTH, startDate),
    ]);

    // Kakao 일별 통계 (local + oauth) - 파라미터 바인딩 사용
    const dailyRaw = await this.apiUsageLogRepository
      .createQueryBuilder('log')
      .select('DATE(log.createdAt)', 'date')
      .addSelect(
        'SUM(CASE WHEN log.provider = :kakaoLocal THEN 1 ELSE 0 END)',
        'localCalls',
      )
      .addSelect(
        'SUM(CASE WHEN log.provider = :kakaoOauth THEN 1 ELSE 0 END)',
        'oauthCalls',
      )
      .where('log.provider IN (:...providers)', {
        providers: [API_PROVIDERS.KAKAO_LOCAL, API_PROVIDERS.KAKAO_OAUTH],
      })
      .andWhere('log.createdAt >= :startDate', { startDate })
      .setParameter('kakaoLocal', API_PROVIDERS.KAKAO_LOCAL)
      .setParameter('kakaoOauth', API_PROVIDERS.KAKAO_OAUTH)
      .groupBy('DATE(log.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<KakaoDailyRaw>();

    return {
      local: localStats,
      oauth: oauthStats,
      dailyBreakdown: this.fillMissingDatesKakao(dailyRaw, startDate, days),
    };
  }

  private async getProviderBaseStats(
    provider: string,
    startDate: Date,
  ): Promise<{
    totalCalls: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgResponseTimeMs: number;
  }> {
    const stats = await this.apiUsageLogRepository
      .createQueryBuilder('log')
      .select('COUNT(*)', 'totalCalls')
      .addSelect(
        'SUM(CASE WHEN log.success = true THEN 1 ELSE 0 END)',
        'successCount',
      )
      .addSelect(
        'SUM(CASE WHEN log.success = false THEN 1 ELSE 0 END)',
        'failureCount',
      )
      .addSelect('AVG(log.responseTimeMs)', 'avgResponseTimeMs')
      .where('log.provider = :provider', { provider })
      .andWhere('log.createdAt >= :startDate', { startDate })
      .getRawOne<{
        totalCalls: string;
        successCount: string;
        failureCount: string;
        avgResponseTimeMs: string;
      }>();

    const totalCalls = parseInt(stats?.totalCalls ?? '0', 10);
    const successCount = parseInt(stats?.successCount ?? '0', 10);
    const failureCount = parseInt(stats?.failureCount ?? '0', 10);
    const avgResponseTimeMs = Math.round(
      parseFloat(stats?.avgResponseTimeMs ?? '0'),
    );

    return {
      totalCalls,
      successCount,
      failureCount,
      successRate:
        totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 0,
      avgResponseTimeMs,
    };
  }

  private async getDailyBreakdown(
    provider: string,
    startDate: Date,
  ): Promise<DailyBreakdownRaw[]> {
    return this.apiUsageLogRepository
      .createQueryBuilder('log')
      .select('DATE(log.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('log.provider = :provider', { provider })
      .andWhere('log.createdAt >= :startDate', { startDate })
      .groupBy('DATE(log.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<DailyBreakdownRaw>();
  }

  private async getEmailSummary(startDate: Date): Promise<{
    totalSent: number;
    successCount: number;
    failureCount: number;
    successRate: number;
  }> {
    const stats = await this.emailLogRepository
      .createQueryBuilder('log')
      .select('COUNT(*)', 'totalsent')
      .addSelect(
        'SUM(CASE WHEN log.success = true THEN 1 ELSE 0 END)',
        'successcount',
      )
      .addSelect(
        'SUM(CASE WHEN log.success = false THEN 1 ELSE 0 END)',
        'failurecount',
      )
      .where('log.createdAt >= :startDate', { startDate })
      .getRawOne<{
        totalsent: string;
        successcount: string;
        failurecount: string;
      }>();

    const totalSent = parseInt(stats?.totalsent ?? '0', 10);
    const successCount = parseInt(stats?.successcount ?? '0', 10);
    const failureCount = parseInt(stats?.failurecount ?? '0', 10);

    return {
      totalSent,
      successCount,
      failureCount,
      successRate:
        totalSent > 0 ? Math.round((successCount / totalSent) * 100) : 0,
    };
  }

  private async getEmailByPurpose(startDate: Date): Promise<
    Array<{
      purpose: string;
      totalSent: number;
      successCount: number;
      failureCount: number;
      successRate: number;
    }>
  > {
    const rawData = await this.emailLogRepository
      .createQueryBuilder('log')
      .select('log.purpose', 'purpose')
      .addSelect('COUNT(*)', 'totalsent')
      .addSelect(
        'SUM(CASE WHEN log.success = true THEN 1 ELSE 0 END)',
        'successcount',
      )
      .addSelect(
        'SUM(CASE WHEN log.success = false THEN 1 ELSE 0 END)',
        'failurecount',
      )
      .where('log.createdAt >= :startDate', { startDate })
      .groupBy('log.purpose')
      .orderBy('totalsent', 'DESC')
      .getRawMany<EmailPurposeRaw>();

    return rawData.map((row) => {
      const totalSent = parseInt(row.totalsent, 10);
      const successCount = parseInt(row.successcount, 10);
      const failureCount = parseInt(row.failurecount, 10);

      return {
        purpose: row.purpose,
        totalSent,
        successCount,
        failureCount,
        successRate:
          totalSent > 0 ? Math.round((successCount / totalSent) * 100) : 0,
      };
    });
  }

  private async getEmailDailyBreakdown(
    startDate: Date,
    days: number,
  ): Promise<
    Array<{
      date: string;
      totalSent: number;
      successCount: number;
      failureCount: number;
    }>
  > {
    const rawData = await this.emailLogRepository
      .createQueryBuilder('log')
      .select('DATE(log.createdAt)', 'date')
      .addSelect('COUNT(*)', 'totalsent')
      .addSelect(
        'SUM(CASE WHEN log.success = true THEN 1 ELSE 0 END)',
        'successcount',
      )
      .addSelect(
        'SUM(CASE WHEN log.success = false THEN 1 ELSE 0 END)',
        'failurecount',
      )
      .where('log.createdAt >= :startDate', { startDate })
      .groupBy('DATE(log.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<EmailDailyRaw>();

    return this.fillMissingDatesEmail(rawData, startDate, days);
  }

  private getModelPricing(model: string): { input: number; output: number } {
    // 모델 이름에서 기본 모델명 추출
    const normalizedModel = model.toLowerCase();

    for (const [key, pricing] of Object.entries(OPENAI_PRICING)) {
      if (normalizedModel.includes(key)) {
        return pricing;
      }
    }

    // 기본값: gpt-4o-mini 가격 적용
    return OPENAI_PRICING['gpt-4o-mini'];
  }

  private fillMissingDates(
    rawResults: DailyBreakdownRaw[],
    startDate: Date,
    days: number,
  ): Array<{ date: string; calls: number }> {
    const resultMap = new Map<string, number>();
    for (const row of rawResults) {
      const dateStr = this.normalizeDateString(row.date);
      resultMap.set(dateStr, parseInt(row.count, 10));
    }

    const trendData: Array<{ date: string; calls: number }> = [];
    const currentDate = new Date(startDate);
    for (let i = 0; i <= days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      trendData.push({
        date: dateStr,
        calls: resultMap.get(dateStr) ?? 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return trendData;
  }

  private fillMissingDatesWithTokens(
    rawResults: OpenAiDailyRaw[],
    startDate: Date,
    days: number,
  ): Array<{ date: string; calls: number; tokens: number }> {
    const resultMap = new Map<string, { calls: number; tokens: number }>();
    for (const row of rawResults) {
      const dateStr = this.normalizeDateString(row.date);
      resultMap.set(dateStr, {
        calls: parseInt(row.calls, 10),
        tokens: parseInt(row.tokens || '0', 10),
      });
    }

    const trendData: Array<{ date: string; calls: number; tokens: number }> =
      [];
    const currentDate = new Date(startDate);
    for (let i = 0; i <= days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const data = resultMap.get(dateStr);
      trendData.push({
        date: dateStr,
        calls: data?.calls ?? 0,
        tokens: data?.tokens ?? 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return trendData;
  }

  private fillMissingDatesKakao(
    rawResults: KakaoDailyRaw[],
    startDate: Date,
    days: number,
  ): Array<{ date: string; localCalls: number; oauthCalls: number }> {
    const resultMap = new Map<
      string,
      { localCalls: number; oauthCalls: number }
    >();
    for (const row of rawResults) {
      const dateStr = this.normalizeDateString(row.date);
      resultMap.set(dateStr, {
        localCalls: parseInt(row.localCalls, 10),
        oauthCalls: parseInt(row.oauthCalls, 10),
      });
    }

    const trendData: Array<{
      date: string;
      localCalls: number;
      oauthCalls: number;
    }> = [];
    const currentDate = new Date(startDate);
    for (let i = 0; i <= days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const data = resultMap.get(dateStr);
      trendData.push({
        date: dateStr,
        localCalls: data?.localCalls ?? 0,
        oauthCalls: data?.oauthCalls ?? 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return trendData;
  }

  private fillMissingDatesEmail(
    rawResults: EmailDailyRaw[],
    startDate: Date,
    days: number,
  ): Array<{
    date: string;
    totalSent: number;
    successCount: number;
    failureCount: number;
  }> {
    const resultMap = new Map<
      string,
      { totalSent: number; successCount: number; failureCount: number }
    >();
    for (const row of rawResults) {
      const dateStr = this.normalizeDateString(row.date);
      resultMap.set(dateStr, {
        totalSent: parseInt(row.totalsent, 10),
        successCount: parseInt(row.successcount, 10),
        failureCount: parseInt(row.failurecount, 10),
      });
    }

    const trendData: Array<{
      date: string;
      totalSent: number;
      successCount: number;
      failureCount: number;
    }> = [];
    const currentDate = new Date(startDate);
    for (let i = 0; i <= days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const data = resultMap.get(dateStr);
      trendData.push({
        date: dateStr,
        totalSent: data?.totalSent ?? 0,
        successCount: data?.successCount ?? 0,
        failureCount: data?.failureCount ?? 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return trendData;
  }

  private normalizeDateString(dateValue: string): string {
    if (typeof dateValue === 'object' && dateValue !== null) {
      return (dateValue as unknown as Date).toISOString().split('T')[0];
    }
    return String(dateValue).split('T')[0];
  }

  private getKSTStartDate(days: number): Date {
    const today = this.getKSTToday();
    today.setDate(today.getDate() - days);
    return today;
  }

  private getKSTToday(): Date {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    kstDate.setUTCHours(0, 0, 0, 0);
    return new Date(kstDate.getTime() - kstOffset);
  }
}
