import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { GOOGLE_PLACES_SEARCH } from '@/common/constants/business.constants';
import { runPipeline } from '@/common/pipeline/pipeline';
import { parseLanguage } from '@/common/utils/language.util';
import { User } from '@/user/entities/user.entity';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { GoogleSearchClient } from '@/external/google/clients/google-search.client';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { PlaceRecommendation } from '@/menu/entities/place-recommendation.entity';
import { PlaceRecommendationSource } from '@/menu/enum/place-recommendation-source.enum';
import { PlaceRecommendationsResponse } from '@/menu/interface/openai-places.interface';
import {
  normalizePlaceIdForStorage,
  parseUserPlaceId,
} from '@/menu/place-id.util';
import { MenuRecommendationService } from '@/menu/services/menu-recommendation.service';
import { OpenAiPlacesService } from '@/menu/services/openai-places.service';
import { UserPlace } from '@/user-place/entities/user-place.entity';

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
    private readonly openAiPlacesService: OpenAiPlacesService,
    private readonly googlePlacesClient: GooglePlacesClient,
    private readonly googleSearchClient: GoogleSearchClient,
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

  async getPlaceDetail(placeId: string) {
    // UserPlace ID 체크
    const userPlaceId = parseUserPlaceId(placeId);
    if (userPlaceId !== null) {
      return this.getUserPlaceDetail(userPlaceId);
    }

    // Google Places API 조회
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
        address: userPlace.address,
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
        menuTypes: userPlace.menuTypes,
        description: userPlace.description,
        openingHours: userPlace.openingHours,
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
   * 가게 추천
   */
  async recommendRestaurants(
    user: User,
    textQuery: string,
    menuName: string,
    menuRecommendationId: number,
    latitude?: number,
    longitude?: number,
  ): Promise<PlaceRecommendationsResponse> {
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

  async buildRecommendationDetailResponse(recommendation: MenuRecommendation) {
    const base = {
      id: recommendation.id,
      prompt: recommendation.prompt,
      reason: recommendation.reason,
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

    const places = await Promise.all(
      placeRecs.map(async (pr) => {
        try {
          const userPlaceId = parseUserPlaceId(pr.placeId);

          if (userPlaceId !== null) {
            // UserPlace 처리
            const userPlace = userPlacesMap.get(userPlaceId);

            if (!userPlace) {
              return this.buildEmptyPlaceResponse(pr);
            }

            return {
              placeId: pr.placeId,
              reason: pr.reason,
              menuName: pr.menuName,
              name: userPlace.name,
              address: userPlace.address,
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

          // Google Places 처리
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
            source: PlaceRecommendationSource.GOOGLE,
          };
        } catch {
          return this.buildEmptyPlaceResponse(pr);
        }
      }),
    );

    return {
      history: { ...base, hasPlaceRecommendations: places.length > 0 },
      places,
    };
  }

  private buildEmptyPlaceResponse(pr: PlaceRecommendation) {
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
      source: PlaceRecommendationSource.GOOGLE,
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
  ) {
    const context: {
      places: Array<{
        id: string;
        name: string | null;
        rating: number | null;
        userRatingCount: number | null;
        priceLevel: string | null;
        reviews: Array<{
          rating: number | null;
          originalText: string | null;
          relativePublishTimeDescription: string | null;
        }> | null;
      }>;
      recommendations: Awaited<
        ReturnType<typeof this.openAiPlacesService.recommendFromGooglePlaces>
      >;
    } = {
      places: [],
      recommendations: null as unknown as Awaited<
        ReturnType<typeof this.openAiPlacesService.recommendFromGooglePlaces>
      >,
    };

    await runPipeline(
      [
        {
          name: 'googlePlacesSearch',
          run: async (ctx) => {
            const { places } = await this.searchRestaurantsWithGooglePlaces(
              textQuery,
              latitude,
              longitude,
              language,
            );

            if (!places?.length) {
              throw new BadRequestException({
                errorCode: ErrorCode.PLACE_SEARCH_NO_RESULTS,
              });
            }

            ctx.places = places;
          },
        },
        {
          name: 'openAiRecommendation',
          run: async (ctx) => {
            ctx.recommendations =
              await this.openAiPlacesService.recommendFromGooglePlaces(
                textQuery,
                ctx.places,
                menuName,
                language,
              );

            if (!ctx.recommendations.recommendations?.length) {
              throw new BadRequestException({
                errorCode: ErrorCode.PLACE_AI_RECOMMENDATION_FAILED,
              });
            }
          },
        },
        {
          name: 'persistPlaceRecommendations',
          run: async (ctx) => {
            const recommendationEntities =
              ctx.recommendations?.recommendations?.map((rec) =>
                this.placeRecommendationRepository.create({
                  menuRecommendation: menuRecord,
                  placeId: normalizePlaceIdForStorage(rec.placeId),
                  reason: rec.reason,
                  menuName,
                }),
              ) ?? [];

            await this.placeRecommendationRepository.save(
              recommendationEntities,
            );
          },
        },
      ],
      context,
      {
        onStepStart: (name) => {
          this.logger.log(
            `🔁 [가게 추천 스텝 시작] step=${name}, query="${textQuery}"`,
          );
        },
        onStepSuccess: (name) => {
          this.logger.log(
            `✅ [가게 추천 스텝 완료] step=${name}, query="${textQuery}"`,
          );
        },
        onStepError: (name, error) => {
          const message =
            error instanceof Error ? error.message : 'unknown error';
          this.logger.error(
            `❌ [가게 추천 스텝 에러] step=${name}, query="${textQuery}", error=${message}`,
            error instanceof Error ? error.stack : undefined,
          );
        },
      },
    );

    return context.recommendations!;
  }
}
