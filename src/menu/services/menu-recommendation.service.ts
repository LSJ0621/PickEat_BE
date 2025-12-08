import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuthenticatedEntity,
  isUser,
} from '../../common/interfaces/authenticated-user.interface';
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
  ) {}

  /**
   * 메뉴 추천 (User/SocialLogin 통합)
   */
  async recommend(
    entity: AuthenticatedEntity,
    prompt: string,
    requestAddress?: string,
    requestLocationLat?: number,
    requestLocationLng?: number,
  ) {
    const likes = entity.preferences?.likes ?? [];
    const dislikes = entity.preferences?.dislikes ?? [];
    const analysis = entity.preferences?.analysis;

    const recommendations =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );

    const record = this.recommendationRepository.create({
      ...(isUser(entity) ? { user: entity } : { socialLogin: entity }),
      prompt,
      recommendations,
      recommendedAt: new Date(),
      requestAddress: requestAddress ?? null,
      requestLocationLat:
        typeof requestLocationLat === 'number' ? requestLocationLat : null,
      requestLocationLng:
        typeof requestLocationLng === 'number' ? requestLocationLng : null,
    });

    await this.recommendationRepository.save(record);

    return this.buildRecommendationResponse(record);
  }

  /**
   * 추천 이력 조회 (User/SocialLogin 통합)
   */
  async getHistory(entity: AuthenticatedEntity, date?: string) {
    const whereClause = isUser(entity)
      ? { userId: entity.id }
      : { socialLoginId: entity.id };

    const fieldName = isUser(entity) ? 'userId' : 'socialLoginId';

    const qb = this.recommendationRepository
      .createQueryBuilder('recommendation')
      .leftJoinAndSelect(
        'recommendation.placeRecommendations',
        'placeRecommendation',
      )
      .where(`recommendation.${fieldName} = :id`, { id: entity.id })
      .orderBy('recommendation.recommendedAt', 'DESC');

    if (date) {
      const { start, end } = this.calculateDateRange(date);
      qb.andWhere('recommendation.recommendedAt >= :start', { start });
      qb.andWhere('recommendation.recommendedAt < :end', { end });
    }

    const history = await qb.getMany();

    return {
      history: history.map((item) => this.mapHistoryItem(item)),
    };
  }

  /**
   * ID로 추천 이력 조회 (User/SocialLogin 통합)
   */
  async findById(
    id: number,
    entity: AuthenticatedEntity,
  ): Promise<MenuRecommendation> {
    const whereClause = isUser(entity)
      ? { id, user: { id: entity.id } }
      : { id, socialLogin: { id: entity.id } };

    const relations = isUser(entity)
      ? ['placeRecommendations', 'user']
      : ['placeRecommendations', 'socialLogin'];

    const recommendation = await this.recommendationRepository.findOne({
      where: whereClause as any,
      relations,
    });

    if (!recommendation) {
      throw new BadRequestException('추천 이력을 찾을 수 없습니다.');
    }

    return recommendation;
  }

  /**
   * 소유권 확인된 추천 이력 조회 (User/SocialLogin 통합)
   */
  async findOwnedRecommendation(
    historyId: number,
    entity: AuthenticatedEntity,
  ): Promise<MenuRecommendation> {
    const whereClause = isUser(entity)
      ? { id: historyId, user: { id: entity.id } }
      : { id: historyId, socialLogin: { id: entity.id } };

    const relations = isUser(entity) ? ['user'] : ['socialLogin'];

    const recommendation = await this.recommendationRepository.findOne({
      where: whereClause,
      relations,
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
      recommendedAt: record.recommendedAt,
      requestAddress: record.requestAddress,
      requestLocation:
        record.requestLocationLat != null && record.requestLocationLng != null
          ? {
              lat: record.requestLocationLat,
              lng: record.requestLocationLng,
            }
          : null,
    };
  }

  private mapHistoryItem(item: MenuRecommendation) {
    return {
      id: item.id,
      recommendations: item.recommendations,
      prompt: item.prompt,
      recommendedAt: item.recommendedAt,
      requestAddress: item.requestAddress,
      requestLocation:
        item.requestLocationLat != null && item.requestLocationLng != null
          ? {
              lat: item.requestLocationLat,
              lng: item.requestLocationLng,
            }
          : null,
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
