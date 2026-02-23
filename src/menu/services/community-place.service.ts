import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { User } from '@/user/entities/user.entity';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { UserPlaceStatus } from '@/user-place/enum/user-place-status.enum';
import { MenuRecommendation } from '../entities/menu-recommendation.entity';
import { PlaceRecommendation } from '../entities/place-recommendation.entity';
import { PlaceRecommendationSource } from '../enum/place-recommendation-source.enum';
import { CommunityPlaceCandidate } from '../interface/community-places.interface';
import { OpenAiCommunityPlacesService } from './openai-community-places.service';

const SEARCH_RADIUS_METERS = 2000; // 2km
const MAX_CANDIDATES = 20;

@Injectable()
export class CommunityPlaceService {
  private readonly logger = new Logger(CommunityPlaceService.name);

  constructor(
    @InjectRepository(PlaceRecommendation)
    private readonly placeRecommendationRepository: Repository<PlaceRecommendation>,
    @InjectRepository(UserPlace)
    private readonly userPlaceRepository: Repository<UserPlace>,
    private readonly openAiCommunityPlacesService: OpenAiCommunityPlacesService,
  ) {}

  async recommendCommunityPlaces(
    user: User,
    latitude: number,
    longitude: number,
    menuName: string,
    menuRecommendation: MenuRecommendation,
    language: 'ko' | 'en' = 'ko',
  ): Promise<PlaceRecommendation[]> {
    this.logger.log(
      `🔍 [커뮤니티 장소 추천 시작] menuName="${menuName}", location=(${latitude}, ${longitude})`,
    );

    // 1. Query APPROVED UserPlaces within 2km radius using PostGIS
    const nearbyUserPlaces = await this.findNearbyApprovedUserPlaces(
      latitude,
      longitude,
    );

    if (nearbyUserPlaces.length === 0) {
      this.logger.log('📭 [커뮤니티 장소 없음] 주변에 승인된 장소가 없습니다.');
      return [];
    }

    this.logger.log(
      `📍 [주변 장소 발견] count=${nearbyUserPlaces.length}, radius=${SEARCH_RADIUS_METERS}m`,
    );

    // 2. Convert to CommunityPlaceCandidate[]
    const candidates = this.convertToCandidates(nearbyUserPlaces);

    // 3. Call OpenAI for recommendations
    const aiResponse =
      await this.openAiCommunityPlacesService.recommendFromCommunityPlaces(
        menuName,
        candidates,
        language,
      );

    if (
      !aiResponse.recommendations ||
      aiResponse.recommendations.length === 0
    ) {
      this.logger.log(
        '🤖 [OpenAI 추천 없음] AI가 관련 장소를 찾지 못했습니다.',
      );
      return [];
    }

    this.logger.log(
      `🤖 [OpenAI 추천 완료] recommendations=${aiResponse.recommendations.length}`,
    );

    // 4. Create a map for quick lookup
    const userPlaceMap = new Map(nearbyUserPlaces.map((up) => [up.id, up]));

    // 5. Save PlaceRecommendation entities
    const recommendationEntities = aiResponse.recommendations
      .map((rec) => {
        const userPlace = userPlaceMap.get(rec.userPlaceId);
        if (!userPlace) {
          this.logger.warn(
            `⚠️ [사용자 장소 없음] userPlaceId=${rec.userPlaceId}가 후보 목록에 없습니다.`,
          );
          return null;
        }

        return this.placeRecommendationRepository.create({
          menuRecommendation,
          placeId: `user_place_${userPlace.id}`,
          reason: rec.matchReason,
          reasonTags: Array.isArray(rec.matchReasonTags)
            ? rec.matchReasonTags
            : [],
          menuName,
          source: PlaceRecommendationSource.USER,
          userPlace,
        });
      })
      .filter((entity): entity is PlaceRecommendation => entity !== null);

    if (recommendationEntities.length === 0) {
      this.logger.warn('[추천 엔티티 없음] 유효한 추천 결과가 없습니다.');
      return [];
    }

    // 6. Save and return
    let savedRecommendations: PlaceRecommendation[];
    try {
      savedRecommendations = await this.placeRecommendationRepository.save(
        recommendationEntities,
      );
      this.logger.log(
        `✅ [커뮤니티 장소 추천 완료] menuRecommendationId=${menuRecommendation.id}, menuName="${menuName}", saved=${savedRecommendations.length}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [커뮤니티 장소 추천 저장 실패] menuRecommendationId=${menuRecommendation.id}, menuName="${menuName}", count=${recommendationEntities.length}, error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException({
        errorCode: ErrorCode.PLACE_RECOMMENDATION_SAVE_FAILED,
      });
    }
    return savedRecommendations;
  }

  private async findNearbyApprovedUserPlaces(
    latitude: number,
    longitude: number,
  ): Promise<(UserPlace & { distance: number })[]> {
    const result = await this.userPlaceRepository
      .createQueryBuilder('userPlace')
      .addSelect(
        `ST_Distance(
          userPlace.location,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography
        )`,
        'distance',
      )
      .where('userPlace.status = :status', {
        status: UserPlaceStatus.APPROVED,
      })
      .andWhere(
        `ST_DWithin(
          userPlace.location,
          ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
          :radiusMeters
        )`,
      )
      .setParameters({
        latitude,
        longitude,
        radiusMeters: SEARCH_RADIUS_METERS,
      })
      .orderBy('distance', 'ASC')
      .limit(MAX_CANDIDATES)
      .getRawAndEntities();

    return result.entities.map((entity, index) => {
      const rawDistance = result.raw[index]?.distance;
      const distanceInMeters = rawDistance
        ? Math.round(parseFloat(String(rawDistance)))
        : 0;

      return {
        ...entity,
        distance: distanceInMeters,
      };
    });
  }

  private convertToCandidates(
    userPlaces: (UserPlace & { distance: number })[],
  ): CommunityPlaceCandidate[] {
    return userPlaces.map((up) => ({
      id: up.id,
      name: up.name,
      address: up.address,
      menuTypes: up.menuTypes || [],
      category: up.category || '',
      description: up.description || null,
      distance: up.distance,
    }));
  }
}
