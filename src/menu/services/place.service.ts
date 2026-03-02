import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { GOOGLE_PLACES_SEARCH } from '@/common/constants/business.constants';
import { parseLanguage } from '@/common/utils/language.util';
import { User } from '@/user/entities/user.entity';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';
import { GOOGLE_CSE_CONFIG } from '@/external/google/google.constants';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { PlaceRecommendation } from '@/menu/entities/place-recommendation.entity';
import { PlaceRecommendationSource } from '@/menu/enum/place-recommendation-source.enum';
import { GeminiPlaceRecommendationsResponse } from '@/menu/interfaces/gemini-places.interface';
import { normalizePlaceId, parseUserPlaceId } from '@/menu/utils/place-id.util';
import { MenuRecommendationService } from '@/menu/services/menu-recommendation.service';
import { GeminiPlacesService } from '@/menu/services/gemini-places.service';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { RedisCacheService } from '@/common/cache/cache.service';

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
    @InjectRepository(UserPlace)
    private readonly userPlaceRepository: Repository<UserPlace>,
    private readonly menuRecommendationService: MenuRecommendationService,
    private readonly geminiPlacesService: GeminiPlacesService,
    private readonly googlePlacesClient: GooglePlacesClient,
    private readonly googleSearchClient: GoogleSearchClient,
    private readonly cacheService: RedisCacheService,
  ) {}

  async searchRestaurantsWithGooglePlaces(
    textQuery: string,
    latitude?: number,
    longitude?: number,
    languageCode?: 'ko' | 'en',
  ) {
    // Build options object properly with type safety
    const options = {
      ...(languageCode && { languageCode }),
      ...(latitude !== undefined &&
        longitude !== undefined && {
          locationBias: {
            circle: {
              center: { latitude, longitude },
              radius: GOOGLE_PLACES_SEARCH.LOCATION_BIAS_RADIUS_METERS,
            },
          },
        }),
    };

    const places = await this.googlePlacesClient.searchByText(
      textQuery,
      Object.keys(options).length > 0 ? options : undefined,
    );

    const result = places.map((place) => ({
      id: place.id,
      name: place.displayName?.text ?? null,
      rating: place.rating ?? null,
      userRatingCount: place.userRatingCount ?? null,
      priceLevel: place.priceLevel ?? null,
      reviews:
        place.reviews?.slice(0, 3).map((review) => ({
          rating: review.rating ?? null,
          originalText: review.originalText?.text ?? review.text?.text ?? null,
          relativePublishTimeDescription:
            review.relativePublishTimeDescription ?? null,
        })) ?? null,
    }));

    return { places: result };
  }

  async getPlaceDetail(placeId: string, language: 'ko' | 'en' = 'ko') {
    // UserPlace ID 체크
    const userPlaceId = parseUserPlaceId(placeId);
    if (userPlaceId !== null) {
      return this.getUserPlaceDetail(userPlaceId);
    }

    // Google Places API 조회
    const place = await this.googlePlacesClient.getDetails(placeId, {
      includeBusinessStatus: true,
      languageCode: language,
    });

    if (!place) {
      return { place: null };
    }

    const resolvedPhotos = await this.googlePlacesClient.resolvePhotoUris(
      place.photos,
    );

    return {
      place: {
        id: place.id ?? placeId,
        name: place.displayName?.text ?? null,
        localizedName: null,
        address: place.formattedAddress ?? null,
        localizedAddress: null,
        location: place.location ?? null,
        rating: place.rating ?? null,
        userRatingCount: place.userRatingCount ?? null,
        priceLevel: place.priceLevel ?? null,
        businessStatus: place.businessStatus ?? null,
        openNow: place.currentOpeningHours?.openNow ?? null,
        photos: resolvedPhotos,
        reviews:
          place.reviews?.map((review) => ({
            rating: review.rating ?? 0,
            text: review.originalText?.text ?? review.text?.text ?? '',
            authorName: review.authorAttribution?.displayName ?? '',
            publishTime: review.publishTime ?? '',
          })) ?? null,
        source: PlaceRecommendationSource.GOOGLE,
      },
    };
  }

  private async getUserPlaceDetail(userPlaceId: number) {
    const userPlace = await this.userPlaceRepository.findOne({
      where: { id: userPlaceId },
      withDeleted: false,
    });

    if (!userPlace) {
      return { place: null };
    }

    return {
      place: {
        id: `user_place_${userPlace.id}`,
        name: userPlace.name,
        localizedName: null,
        address: userPlace.address,
        localizedAddress: null,
        location: {
          latitude: Number(userPlace.latitude),
          longitude: Number(userPlace.longitude),
        },
        rating: null,
        userRatingCount: null,
        priceLevel: null,
        businessStatus: null,
        openNow: null,
        photos: userPlace.photos ?? [],
        reviews: null,
        source: PlaceRecommendationSource.USER,
        phoneNumber: userPlace.phoneNumber,
        category: userPlace.category,
        menuItems: userPlace.menuItems,
        description: userPlace.description,
        businessHours: userPlace.businessHours,
      },
    };
  }

  async searchRestaurantBlogs(
    query: string,
    restaurantName: string,
    language?: 'ko' | 'en' | 'ja' | 'zh',
    searchName?: string,
    searchAddress?: string,
  ) {
    // Determine language restrict code
    const options: { lr?: string; hl?: string } = {};

    if (language) {
      const restrictCode =
        GOOGLE_CSE_CONFIG.DEFAULTS.LANGUAGE_RESTRICT_CODES[language];
      if (restrictCode) {
        options.lr = restrictCode;
      }
      options.hl = language;
    }

    // Use searchName/searchAddress if provided, otherwise use original values
    const queryName = searchName || restaurantName;
    const queryAddress = searchAddress || query;
    const searchQuery = `${queryAddress} ${queryName}`;

    // API 호출 (캐싱 제거됨)
    const blogs = await this.googleSearchClient.searchBlogs(
      searchQuery,
      queryName,
      options,
    );

    return { blogs };
  }

  /**
   * 가게 추천
   */
  async recommendRestaurants(
    user: User,
    textQuery: string,
    menuName: string,
    menuRecommendationId: number,
    latitude?: number,
    longitude?: number,
  ): Promise<GeminiPlaceRecommendationsResponse> {
    this.validateRecommendInput(menuName, menuRecommendationId);

    const menuRecord = await this.menuRecommendationService.findById(
      menuRecommendationId,
      user,
    );

    this.validateNoExistingRecommendation(menuRecord, menuName);

    // Determine language from user preference (default 'ko')
    const language = parseLanguage(user.preferredLanguage);

    return this.executeRecommendation(
      menuRecord,
      textQuery,
      menuName,
      language,
      latitude,
      longitude,
    );
  }

  async buildRecommendationDetailResponse(
    recommendation: MenuRecommendation,
    language: 'ko' | 'en' = 'ko',
  ) {
    const base = {
      id: recommendation.id,
      prompt: recommendation.prompt,
      intro: recommendation.intro,
      recommendations: recommendation.recommendationDetails, // 구조화된 데이터 반환 (condition + menu)
      closing: recommendation.closing,
      recommendedAt: recommendation.recommendedAt,
      requestAddress: recommendation.requestAddress,
    };

    const placeRecs = recommendation.placeRecommendations ?? [];
    if (placeRecs.length === 0) {
      return {
        history: { ...base, hasPlaceRecommendations: false },
        places: [],
      };
    }

    // Pre-fetch all UserPlaces in a single query to avoid N+1 problem
    const userPlaceIds = placeRecs
      .map((pr) => parseUserPlaceId(pr.placeId))
      .filter((id): id is number => id !== null);

    const userPlacesMap = new Map<number, UserPlace>();
    if (userPlaceIds.length > 0) {
      const userPlaces = await this.userPlaceRepository.find({
        where: { id: In(userPlaceIds) },
        withDeleted: false,
      });
      userPlaces.forEach((up) => userPlacesMap.set(up.id, up));
    }

    const places = placeRecs.map((pr) => {
      const userPlaceId = parseUserPlaceId(pr.placeId);

      if (userPlaceId !== null) {
        // UserPlace 처리
        const userPlace = userPlacesMap.get(userPlaceId);

        if (!userPlace) {
          return this.buildDbFallbackPlaceResponse(pr, language);
        }

        return {
          placeId: pr.placeId,
          reason: pr.reason,
          reasonTags: pr.reasonTags ?? [],
          menuName: pr.menuName,
          name: userPlace.name,
          localizedName: null,
          address: userPlace.address,
          localizedAddress: null,
          rating: null,
          userRatingCount: null,
          priceLevel: null,
          businessStatus: null,
          openNow: null,
          photos: userPlace.photos ?? [],
          reviews: null,
          source: PlaceRecommendationSource.USER,
          phoneNumber: userPlace.phoneNumber,
          category: userPlace.category,
        };
      }

      // Google Places 처리 (DB 데이터만 사용, 캐시 제거됨)
      return this.buildDbFallbackPlaceResponse(pr, language);
    });

    return {
      history: { ...base, hasPlaceRecommendations: places.length > 0 },
      places,
    };
  }

  private buildDbFallbackPlaceResponse(
    pr: PlaceRecommendation,
    language: 'ko' | 'en',
  ) {
    const name = language === 'ko' ? (pr.nameKo ?? null) : (pr.nameEn ?? null);
    const address =
      language === 'ko' ? (pr.addressKo ?? null) : (pr.addressEn ?? null);
    const localizedName =
      pr.nameLocal ??
      (language === 'ko' ? (pr.nameEn ?? null) : (pr.nameKo ?? null));
    const localizedAddress =
      pr.addressLocal ??
      (language === 'ko' ? (pr.addressEn ?? null) : (pr.addressKo ?? null));

    return {
      placeId: pr.placeId,
      reason: pr.reason,
      reasonTags: pr.reasonTags ?? [],
      menuName: pr.menuName,
      name,
      localizedName,
      address,
      localizedAddress,
      rating: null,
      userRatingCount: null,
      priceLevel: null,
      businessStatus: null,
      openNow: null,
      photos: [],
      reviews: null,
      source: pr.source ?? PlaceRecommendationSource.GOOGLE,
    };
  }

  private validateRecommendInput(
    menuName: string,
    menuRecommendationId?: number,
  ) {
    if (!menuName) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_NAME_REQUIRED,
      });
    }

    if (typeof menuRecommendationId !== 'number') {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_RECOMMENDATION_ID_REQUIRED,
      });
    }
  }

  private validateNoExistingRecommendation(
    menuRecord: MenuRecommendation,
    menuName: string,
  ) {
    if (
      menuRecord.placeRecommendations?.some((pr) => pr.menuName === menuName)
    ) {
      throw new BadRequestException({
        errorCode: ErrorCode.PLACE_ALREADY_RECOMMENDED,
      });
    }
  }

  private async executeRecommendation(
    menuRecord: MenuRecommendation,
    textQuery: string,
    menuName: string,
    language: 'ko' | 'en',
    latitude?: number,
    longitude?: number,
  ): Promise<GeminiPlaceRecommendationsResponse> {
    // Validate coordinates
    if (latitude === undefined || longitude === undefined) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADDRESS_LAT_LNG_REQUIRED,
      });
    }

    this.logger.log(
      `🔁 [Gemini 가게 추천 시작] menu="${menuName}", address="${menuRecord.requestAddress}", lat=${latitude}, lng=${longitude}, lang=${language}`,
    );

    // Call Gemini API directly (no Google Places search needed)
    const geminiResponse = await this.geminiPlacesService.recommendRestaurants(
      menuName,
      menuRecord.requestAddress, // address
      latitude,
      longitude,
      language,
    );

    if (!geminiResponse.recommendations?.length) {
      throw new BadRequestException({
        errorCode: ErrorCode.PLACE_AI_RECOMMENDATION_FAILED,
      });
    }

    // Filter out recommendations with null placeId
    const validRecommendations = geminiResponse.recommendations.filter(
      (rec) => rec.placeId != null,
    );

    if (validRecommendations.length === 0) {
      this.logger.warn('[Gemini] placeId가 있는 추천 결과 없음');
    }

    this.logger.log(
      `[Gemini 가게 추천 완료] total=${geminiResponse.recommendations.length}, valid=${validRecommendations.length}`,
    );

    // Persist PlaceRecommendations to database (PickEat 자체 데이터만)
    const recommendationEntities = validRecommendations.map((rec) =>
      this.placeRecommendationRepository.create({
        menuRecommendation: menuRecord,
        placeId: normalizePlaceId(rec.placeId!), // Non-null guaranteed by filter
        reason: rec.reason,
        reasonTags: Array.isArray(rec.reasonTags) ? rec.reasonTags : [],
        menuName,
        // NEW: 다국어 저장
        nameKo: rec.nameKo,
        nameEn: rec.nameEn,
        nameLocal: rec.nameLocal ?? null,
        addressKo: rec.addressKo ?? null,
        addressEn: rec.addressEn ?? null,
        addressLocal: rec.addressLocal ?? null,
        placeLatitude: rec.location?.latitude ?? null,
        placeLongitude: rec.location?.longitude ?? null,
      }),
    );

    try {
      await this.placeRecommendationRepository.save(recommendationEntities);
      this.logger.log(
        `💾 [DB 저장 완료] menuRecommendationId=${menuRecord.id}, menuName="${menuName}", count=${recommendationEntities.length}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [DB 저장 실패] menuRecommendationId=${menuRecord.id}, menuName="${menuName}", count=${recommendationEntities.length}, error=${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException({
        errorCode: ErrorCode.PLACE_RECOMMENDATION_SAVE_FAILED,
      });
    }

    return geminiResponse;
  }
}
