import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedEntity } from '../../common/interfaces/authenticated-user.interface';
import { GooglePlacesClient } from '../../external/google/clients/google-places.client';
import { GoogleSearchClient } from '../../external/google/clients/google-search.client';
import { MenuRecommendation } from '../entities/menu-recommendation.entity';
import { PlaceRecommendation } from '../entities/place-recommendation.entity';
import { normalizePlaceIdForStorage } from '../place-id.util';
import { MenuRecommendationService } from './menu-recommendation.service';
import { OpenAiPlacesService } from './openai-places.service';

/**
 * 가게/장소 관련 서비스
 * - Google Places 검색
 * - 가게 상세 조회
 * - 블로그 검색
 * - AI 가게 추천
 */
@Injectable()
export class PlaceService {
  private readonly logger = new Logger(PlaceService.name);

  constructor(
    @InjectRepository(PlaceRecommendation)
    private readonly placeRecommendationRepository: Repository<PlaceRecommendation>,
    private readonly menuRecommendationService: MenuRecommendationService,
    private readonly openAiPlacesService: OpenAiPlacesService,
    private readonly googlePlacesClient: GooglePlacesClient,
    private readonly googleSearchClient: GoogleSearchClient,
  ) {}

  async searchRestaurantsWithGooglePlaces(textQuery: string) {
    const places = await this.googlePlacesClient.searchByText(textQuery);

    const result = places.map((place) => ({
      id: place.id,
      name: place.displayName?.text ?? null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      priceLevel: place.priceLevel ?? null,
      reviews:
        place.reviews?.map((review) => ({
          rating: review.rating ?? null,
          originalText: review.originalText?.text ?? review.text?.text ?? null,
          relativePublishTimeDescription:
            review.relativePublishTimeDescription ?? null,
        })) ?? null,
    }));

    return { places: result };
  }

  async getPlaceDetail(placeId: string) {
    const place = await this.googlePlacesClient.getDetails(placeId, {
      includeBusinessStatus: true,
    });

    if (!place) {
      return { place: null };
    }

    const resolvedPhotos = await this.googlePlacesClient.resolvePhotoUris(
      place.photos,
    );

    return {
      place: {
        id: place.id ?? null,
        name: place.displayName?.text ?? null,
        address: place.formattedAddress ?? null,
        location: place.location ?? null,
        rating: place.rating ?? null,
        userRatingCount: place.userRatingCount ?? null,
        priceLevel: place.priceLevel ?? null,
        businessStatus: place.businessStatus ?? null,
        openNow: place.currentOpeningHours?.openNow ?? null,
        photos: resolvedPhotos,
        reviews:
          place.reviews?.map((review) => ({
            rating: review.rating ?? null,
            text: review.originalText?.text ?? review.text?.text ?? null,
            authorName: review.authorAttribution?.displayName ?? null,
            publishTime: review.publishTime ?? null,
          })) ?? null,
      },
    };
  }

  async searchRestaurantBlogs(query: string, restaurantName: string) {
    const blogs = await this.googleSearchClient.searchBlogs(
      query,
      restaurantName,
    );

    return { blogs };
  }

  /**
   * 가게 추천 (User/SocialLogin 통합)
   */
  async recommendRestaurants(
    entity: AuthenticatedEntity,
    textQuery: string,
    menuName: string,
    menuRecommendationId: number,
  ) {
    this.validateRecommendInput(menuName, menuRecommendationId);

    const menuRecord = await this.menuRecommendationService.findById(
      menuRecommendationId,
      entity,
    );

    this.validateNoExistingRecommendation(menuRecord, menuName);

    return this.executeRecommendation(menuRecord, textQuery, menuName);
  }

  async buildRecommendationDetailResponse(recommendation: MenuRecommendation) {
    const base = {
      id: recommendation.id,
      prompt: recommendation.prompt,
      recommendedAt: recommendation.recommendedAt,
      requestAddress: recommendation.requestAddress,
      requestLocation:
        recommendation.requestLocationLat != null &&
        recommendation.requestLocationLng != null
          ? {
              lat: recommendation.requestLocationLat,
              lng: recommendation.requestLocationLng,
            }
          : null,
    };

    const placeRecs = recommendation.placeRecommendations ?? [];
    if (placeRecs.length === 0) {
      return {
        history: { ...base, hasPlaceRecommendations: false },
        places: [],
      };
    }

    const places = await Promise.all(
      placeRecs.map(async (pr) => {
        try {
          const detail = await this.googlePlacesClient.getDetails(pr.placeId);
          const resolvedPhotos = detail
            ? await this.googlePlacesClient.resolvePhotoUris(detail.photos)
            : [];

          return {
            placeId: pr.placeId,
            reason: pr.reason,
            menuName: pr.menuName,
            name: detail?.displayName?.text ?? null,
            address: detail?.formattedAddress ?? null,
            rating: detail?.rating ?? null,
            userRatingCount: detail?.userRatingCount ?? null,
            priceLevel: detail?.priceLevel ?? null,
            businessStatus: detail?.businessStatus ?? null,
            openNow: detail?.currentOpeningHours?.openNow ?? null,
            photos: resolvedPhotos,
            reviews:
              detail?.reviews?.map((review) => ({
                rating: review.rating ?? null,
                text: review.originalText?.text ?? review.text?.text ?? null,
                authorName: review.authorAttribution?.displayName ?? null,
                publishTime: review.publishTime ?? null,
              })) ?? null,
          };
        } catch {
          return {
            placeId: pr.placeId,
            reason: pr.reason,
            menuName: pr.menuName,
            name: null,
            address: null,
            rating: null,
            userRatingCount: null,
            priceLevel: null,
            businessStatus: null,
            openNow: null,
            photos: [],
            reviews: null,
          };
        }
      }),
    );

    return {
      history: { ...base, hasPlaceRecommendations: places.length > 0 },
      places,
    };
  }

  private validateRecommendInput(
    menuName: string,
    menuRecommendationId?: number,
  ) {
    if (!menuName) {
      throw new BadRequestException('menuName이 필요합니다.');
    }

    if (typeof menuRecommendationId !== 'number') {
      throw new BadRequestException(
        'menuRecommendationId가 필요합니다. 먼저 메뉴 추천 이력을 생성한 뒤 사용하세요.',
      );
    }
  }

  private validateNoExistingRecommendation(
    menuRecord: MenuRecommendation,
    menuName: string,
  ) {
    if (
      menuRecord.placeRecommendations?.some((pr) => pr.menuName === menuName)
    ) {
      throw new BadRequestException(
        '이 메뉴는 이미 AI 가게 추천을 받았습니다. 기존 결과를 확인하세요.',
      );
    }
  }

  private async executeRecommendation(
    menuRecord: MenuRecommendation,
    textQuery: string,
    menuName: string,
  ) {
    this.logger.log(
      `🔁 [가게 추천 플로우 시작] query="${textQuery}" - Google Places 검색 후 LLM 추천`,
    );

    const { places } = await this.searchRestaurantsWithGooglePlaces(textQuery);

    if (!places || places.length === 0) {
      throw new BadRequestException(
        `"${textQuery}"에 대한 검색 결과를 찾을 수 없습니다. 다른 검색어로 시도해주세요.`,
      );
    }

    const recommendations =
      await this.openAiPlacesService.recommendFromGooglePlaces(
        textQuery,
        places,
      );

    await this.placeRecommendationRepository.save(
      recommendations.recommendations?.map((rec) =>
        this.placeRecommendationRepository.create({
          menuRecommendation: menuRecord,
          placeId: normalizePlaceIdForStorage(rec.placeId),
          reason: rec.reason,
          menuName,
        }),
      ) ?? [],
    );

    this.logger.log(
      `✅ [가게 추천 플로우 완료] query="${textQuery}", recommended=${recommendations.recommendations.length}`,
    );

    return recommendations;
  }
}
