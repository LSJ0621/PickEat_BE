import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { parseLanguage } from '@/common/utils/language.util';
import { PageInfo } from '@/common/interfaces/pagination.interface';
import { User } from '@/user/entities/user.entity';
import { UserAddressService } from '@/user/services/user-address.service';
import { UserTasteAnalysisService } from '@/user/services/user-taste-analysis.service';
import { MenuRecommendation } from '../entities/menu-recommendation.entity';
import { OpenAiMenuService } from './openai-menu.service';

/**
 * 메뉴 추천 관련 서비스
 * - LLM을 통한 메뉴 추천
 * - 추천 이력 조회
 */
@Injectable()
export class MenuRecommendationService {
  private readonly logger = new Logger(MenuRecommendationService.name);

  constructor(
    @InjectRepository(MenuRecommendation)
    private readonly recommendationRepository: Repository<MenuRecommendation>,
    private readonly openAiMenuService: OpenAiMenuService,
    private readonly userAddressService: UserAddressService,
    private readonly userTasteAnalysisService: UserTasteAnalysisService,
  ) {}

  /**
   * 메뉴 추천
   */
  async recommend(user: User, prompt: string) {
    this.logger.log(`[추천 요청] userId: ${user.id}`);

    const likes = user.preferences?.likes ?? [];
    const dislikes = user.preferences?.dislikes ?? [];

    // Fetch taste analysis from UserTasteAnalysis table (실패해도 추천은 계속 동작)
    let tasteAnalysis: Awaited<
      ReturnType<typeof this.userTasteAnalysisService.getByUserId>
    > = null;
    try {
      tasteAnalysis = await this.userTasteAnalysisService.getByUserId(user.id);
    } catch (error) {
      this.logger.warn(
        `Failed to fetch taste analysis for user ${user.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // tasteAnalysis 없이도 메뉴 추천 계속 진행
    }

    // compactSummary 추출 (토큰 절감용)
    const compactSummary = tasteAnalysis?.compactSummary ?? undefined;

    // Use compactSummary as primary, fallback to user.preferences.analysis
    // Trim and filter out empty strings to avoid passing "" as valid analysis
    const analysis =
      compactSummary?.trim() || user.preferences?.analysis?.trim() || undefined;

    // Extract structured analysis data
    const structuredAnalysis = tasteAnalysis
      ? {
          stablePatterns: tasteAnalysis.stablePatterns,
          recentSignals: tasteAnalysis.recentSignals,
          diversityHints: tasteAnalysis.diversityHints,
        }
      : undefined;

    // Determine language from user preference (default 'ko')
    const language = parseLanguage(user.preferredLanguage);

    // 기본 주소 조회 (필수)
    const defaultAddress =
      await this.userAddressService.getDefaultAddress(user);
    if (!defaultAddress || !defaultAddress.roadAddress) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_DEFAULT_ADDRESS_REQUIRED,
      });
    }

    const userAddressString = defaultAddress.roadAddress;
    this.logger.log(`[기본 주소 조회] ${userAddressString}`);

    const { intro, recommendations, closing } =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
        language,
        userAddressString,
        user.birthDate
          ? parseInt(user.birthDate.substring(0, 4), 10)
          : undefined,
        user.gender ?? undefined,
        compactSummary,
        structuredAnalysis,
      );

    this.logger.log(`🎯 [추천 완료] ${recommendations.length}개 메뉴 추천됨`);

    // Extract menu names for the recommendations array
    const menuNames = recommendations.map((item) => item.menu);

    const record = this.recommendationRepository.create({
      user,
      prompt,
      recommendations: menuNames,
      intro,
      closing,
      recommendationDetails: recommendations,
      recommendedAt: new Date(),
      requestAddress: defaultAddress.roadAddress, // 서버에서 조회한 기본 주소 저장 (필수)
    });

    await this.recommendationRepository.save(record);

    return this.buildRecommendationResponse(record);
  }

  /**
   * 추천 이력 조회 (Pagination 지원)
   */
  async getHistory(
    user: User,
    page: number = 1,
    limit: number = 10,
    date?: string,
  ): Promise<{
    items: ReturnType<typeof this.mapHistoryItem>[];
    pageInfo: PageInfo;
  }> {
    const qb = this.recommendationRepository
      .createQueryBuilder('recommendation')
      .leftJoinAndSelect(
        'recommendation.placeRecommendations',
        'placeRecommendation',
        'placeRecommendation.deletedAt IS NULL',
      )
      .where('recommendation.user.id = :id', { id: user.id })
      .orderBy('recommendation.recommendedAt', 'DESC');

    if (date) {
      const { start, end } = this.calculateDateRange(date);
      qb.andWhere('recommendation.recommendedAt >= :start', { start });
      qb.andWhere('recommendation.recommendedAt < :end', { end });
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

    return {
      items: items.map((item) => this.mapHistoryItem(item)),
      pageInfo,
    };
  }

  /**
   * ID로 추천 이력 조회
   */
  async findById(id: number, user: User): Promise<MenuRecommendation> {
    const recommendation = await this.recommendationRepository
      .createQueryBuilder('recommendation')
      .leftJoinAndSelect('recommendation.user', 'user')
      .leftJoinAndSelect(
        'recommendation.placeRecommendations',
        'placeRecommendation',
        'placeRecommendation.deletedAt IS NULL',
      )
      .where('recommendation.id = :id', { id })
      .andWhere('user.id = :userId', { userId: user.id })
      .getOne();

    if (!recommendation) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_HISTORY_NOT_FOUND,
      });
    }

    return recommendation;
  }

  /**
   * 소유권 확인된 추천 이력 조회
   */
  async findOwnedRecommendation(
    historyId: number,
    user: User,
  ): Promise<MenuRecommendation> {
    const recommendation = await this.recommendationRepository.findOne({
      where: { id: historyId, user: { id: user.id } },
      relations: ['user'],
    });

    if (!recommendation) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_HISTORY_OWNERSHIP_REQUIRED,
      });
    }

    return recommendation;
  }

  private buildRecommendationResponse(record: MenuRecommendation) {
    return {
      id: record.id,
      intro: record.intro,
      recommendations: record.recommendationDetails, // 구조화된 데이터 반환 (condition + menu)
      closing: record.closing,
      recommendedAt: record.recommendedAt,
      requestAddress: record.requestAddress,
    };
  }

  private mapHistoryItem(item: MenuRecommendation) {
    return {
      id: item.id,
      intro: item.intro,
      recommendations: item.recommendationDetails, // 구조화된 데이터 반환 (condition + menu)
      closing: item.closing,
      prompt: item.prompt,
      recommendedAt: item.recommendedAt,
      requestAddress: item.requestAddress,
      hasPlaceRecommendations:
        Array.isArray(item.placeRecommendations) &&
        item.placeRecommendations.length > 0,
    };
  }

  private calculateDateRange(date: string) {
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException(ErrorCode.INVALID_DATE_PARAMETER);
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
}
