import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageInfo } from '../../common/interfaces/pagination.interface';
import { User } from '../../user/entities/user.entity';
import { UserAddressService } from '../../user/services/user-address.service';
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
  ) {}

  /**
   * 메뉴 추천
   */
  async recommend(user: User, prompt: string) {
    const likes = user.preferences?.likes ?? [];
    const dislikes = user.preferences?.dislikes ?? [];
    const analysis = user.preferences?.analysis;

    const { recommendations, reason } =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );

    // 기본 주소 조회 (필수)
    const defaultAddress =
      await this.userAddressService.getDefaultAddress(user);
    if (!defaultAddress || !defaultAddress.roadAddress) {
      throw new BadRequestException('기본 주소를 설정해주세요.');
    }

    const record = this.recommendationRepository.create({
      user,
      prompt,
      recommendations,
      reason,
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
    const recommendation = await this.recommendationRepository.findOne({
      where: { id, user: { id: user.id } },
      relations: ['placeRecommendations', 'user'],
    });

    if (!recommendation) {
      throw new BadRequestException('추천 이력을 찾을 수 없습니다.');
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
      throw new BadRequestException(
        '본인 추천 이력에만 선택을 연결할 수 있습니다.',
      );
    }

    return recommendation;
  }

  private buildRecommendationResponse(record: MenuRecommendation) {
    return {
      id: record.id,
      recommendations: record.recommendations,
      reason: record.reason,
      recommendedAt: record.recommendedAt,
      requestAddress: record.requestAddress,
    };
  }

  private mapHistoryItem(item: MenuRecommendation) {
    return {
      id: item.id,
      recommendations: item.recommendations,
      reason: item.reason,
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
      throw new BadRequestException('Invalid date parameter');
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
}
