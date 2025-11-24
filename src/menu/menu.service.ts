import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialLogin } from '../user/entities/social-login.entity';
import { User } from '../user/entities/user.entity';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import { OpenAiMenuService } from './openai-menu.service';
import { OpenAiPlacesService } from './openai-places.service';

const GOOGLE_PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PLACES_DETAILS_API_URL = 'https://places.googleapis.com/v1/places';
const GOOGLE_PLACES_PHOTO_MEDIA_URL = 'https://places.googleapis.com/v1';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const GOOGLE_CSE_API_URL = 'https://www.googleapis.com/customsearch/v1';
const GOOGLE_CSE_CX = process.env.GOOGLE_CSE_CX;

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuRecommendation)
    private readonly recommendationRepository: Repository<MenuRecommendation>,
    @InjectRepository(PlaceRecommendation)
    private readonly placeRecommendationRepository: Repository<PlaceRecommendation>,
    private readonly openAiMenuService: OpenAiMenuService,
    private readonly openAiPlacesService: OpenAiPlacesService,
    private readonly httpService: HttpService,
  ) {}

  private readonly logger = new Logger(MenuService.name);

  async recommendForUser(user: User, prompt: string) {
    // 좋아하는 것과 싫어하는 것을 모두 전달
    const likes = user.preferences?.likes ?? [];
    const dislikes = user.preferences?.dislikes ?? [];
    const recommendations =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );
    const record = this.recommendationRepository.create({
      user,
      prompt,
      recommendations,
      recommendedAt: new Date(),
    });
    await this.recommendationRepository.save(record);
    return {
      recommendations: record.recommendations,
      recommendedAt: record.recommendedAt,
    };
  }

  async recommendForSocialLogin(socialLogin: SocialLogin, prompt: string) {
    // 좋아하는 것과 싫어하는 것을 모두 전달
    const likes = socialLogin.preferences?.likes ?? [];
    const dislikes = socialLogin.preferences?.dislikes ?? [];
    const recommendations =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );
    const record = this.recommendationRepository.create({
      socialLogin,
      prompt,
      recommendations,
      recommendedAt: new Date(),
    });
    await this.recommendationRepository.save(record);
    return {
      recommendations: record.recommendations,
      recommendedAt: record.recommendedAt,
    };
  }

  async getHistory(user: User, date?: string) {
    const qb = this.recommendationRepository
      .createQueryBuilder('recommendation')
      .leftJoinAndSelect('recommendation.placeRecommendations', 'placeRecommendation')
      .where('recommendation.userId = :userId', { userId: user.id })
      .orderBy('recommendation.recommendedAt', 'DESC');

    if (date) {
      const { start, end } = this.calculateDateRange(date);
      qb.andWhere('recommendation.recommendedAt >= :start', { start });
      qb.andWhere('recommendation.recommendedAt < :end', { end });
    }

    const history = await qb.getMany();
    return {
      history: history.map((item) => ({
        id: item.id,
        type: item.type,
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
      })),
    };
  }

  async getHistoryForSocialLogin(socialLogin: SocialLogin, date?: string) {
    const qb = this.recommendationRepository
      .createQueryBuilder('recommendation')
      .leftJoinAndSelect('recommendation.placeRecommendations', 'placeRecommendation')
      .where('recommendation.socialLoginId = :socialLoginId', {
        socialLoginId: socialLogin.id,
      })
      .orderBy('recommendation.recommendedAt', 'DESC');

    if (date) {
      const { start, end } = this.calculateDateRange(date);
      qb.andWhere('recommendation.recommendedAt >= :start', { start });
      qb.andWhere('recommendation.recommendedAt < :end', { end });
    }

    const history = await qb.getMany();
    return {
      history: history.map((item) => ({
        id: item.id,
        type: item.type,
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
      })),
    };
  }

  async searchRestaurantsWithGooglePlaces(textQuery: string) {
    if (!GOOGLE_API_KEY) {
      this.logger.warn('GOOGLE_API_KEY가 설정되지 않았습니다.');
      throw new Error('GOOGLE_API_KEY가 설정되지 않았습니다.');
    }

    const body: any = {
      textQuery,
      languageCode: 'ko',
    };

    this.logger.log(`🔍 [Google Places 텍스트 검색] query="${textQuery}"`);

    try {
      const response = await this.httpService
        .post(
          GOOGLE_PLACES_API_URL,
          body,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': GOOGLE_API_KEY,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus,places.reviews,places.reviewSummary',
              Referer: 'http://localhost:3000',
            },
          },
        )
        .toPromise();

      const places = response?.data?.places || [];

      const result = places.map((place: any) => ({
        id: place.id,
        name: place.displayName?.text ?? null,
        address: place.formattedAddress ?? null,
        location: place.location ?? null,
        rating: place.rating ?? null,
        userRatingCount: place.userRatingCount ?? null,
        priceLevel: place.priceLevel ?? null,
        priceRange: place.priceLevel ?? null,
        businessStatus: place.businessStatus ?? null,
        reviews:
          place.reviews?.map((review: any) => ({
            rating: review.rating ?? null,
            text: review.text?.text ?? null,
            originalText: review.originalText?.text ?? null,
            relativePublishTimeDescription:
              review.relativePublishTimeDescription ?? null,
            publishTime: review.publishTime ?? null,
          })) ?? null,
        reviewSummary: place.reviewSummary ?? null,
      }));

      this.logger.log(
        `✅ [Google Places 텍스트 검색 응답] count=${result.length}`,
      );
      return { places: result };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const statusCode = error?.response?.status;
      const errorData = error?.response?.data;
      this.logger.error(
        `❌ [Google Places 텍스트 검색 에러] query="${textQuery}", status=${statusCode}, error=${message}`,
      );
      if (errorData) {
        this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
      }
      throw error;
    }
  }

  /**
   * Google Places Photos API를 사용해 photoName 목록을 실제 이미지 URL(photoUri) 목록으로 변환
   * - DB에는 저장하지 않고 응답에만 포함
   * - 프론트에는 photoUri(string) 배열만 전달
   */
  private async resolvePhotoUris(
    photos: any[] | null | undefined,
    maxHeightPx = 400,
    maxWidthPx = 400,
  ): Promise<string[]> {
    if (!photos || photos.length === 0) {
      return [];
    }

    if (!GOOGLE_API_KEY) {
      this.logger.warn(
        'GOOGLE_API_KEY가 설정되지 않아 사진 URL을 생성할 수 없습니다.',
      );
      return [];
    }

    const tasks = photos.map(async (photo: any) => {
      const photoName = photo?.name;
      if (!photoName) {
        return null;
      }

      try {
        const url = `${GOOGLE_PLACES_PHOTO_MEDIA_URL}/${photoName}/media`;
        const response = await this.httpService
          .get(url, {
            params: {
              key: GOOGLE_API_KEY,
              maxHeightPx,
              maxWidthPx,
              skipHttpRedirect: true,
            },
            headers: {
              Referer: 'http://localhost:3000',
            },
          })
          .toPromise();

        const photoUri = response?.data?.photoUri ?? null;
        return photoUri;
      } catch (error: any) {
        const message = error instanceof Error ? error.message : 'unknown error';
        const statusCode = error?.response?.status;
        const errorData = error?.response?.data;
        this.logger.error(
          `❌ [Google Places 사진 URL 생성 에러] name="${photoName}", status=${statusCode}, error=${message}`,
        );
        if (errorData) {
          this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
        }
        return null;
      }
    });

    const results = await Promise.all(tasks);
    return results.filter((item): item is string => !!item);
  }

  /**
   * 특정 추천 이력 1건 + 그 이력에서 생성된 AI 가게 추천들을 조회하고,
   * 각 placeId에 대해 Google Places Details API로 상세 정보를 합쳐서 반환
   */
  private async buildRecommendationDetailResponse(
    recommendation: MenuRecommendation,
  ) {
    const base = {
      id: recommendation.id,
      type: recommendation.type,
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
    if (!GOOGLE_API_KEY || placeRecs.length === 0) {
      return {
        history: {
          ...base,
          hasPlaceRecommendations: placeRecs.length > 0,
        },
        places: [],
      };
    }

    const fetchPlaceDetail = async (placeId: string) => {
      try {
        const response = await this.httpService
          .get(`${GOOGLE_PLACES_DETAILS_API_URL}/${placeId}`, {
            params: {
              languageCode: 'ko',
            },
            headers: {
              'X-Goog-Api-Key': GOOGLE_API_KEY,
              'X-Goog-FieldMask':
                'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,photos,reviews,currentOpeningHours.openNow',
              Referer: 'http://localhost:3000',
            },
          })
          .toPromise();
        return response?.data ?? null;
      } catch (error: any) {
        const message = error instanceof Error ? error.message : 'unknown error';
        const statusCode = error?.response?.status;
        const errorData = error?.response?.data;
        this.logger.error(
          `❌ [Google Places 상세 조회 에러] placeId="${placeId}", status=${statusCode}, error=${message}`,
        );
        if (errorData) {
          this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
        }
        return null;
      }
    };

    const detailsList = await Promise.all(
      placeRecs.map((pr) => fetchPlaceDetail(pr.placeId)),
    );

    const places = await Promise.all(
      placeRecs.map(async (pr, index) => {
        const detail = detailsList[index] || {};
        const resolvedPhotos = await this.resolvePhotoUris(detail.photos);
        return {
          placeId: pr.placeId,
          reason: pr.reason,
          name: detail.displayName?.text ?? null,
          address: detail.formattedAddress ?? null,
          rating: detail.rating ?? null,
          userRatingCount: detail.userRatingCount ?? null,
          priceLevel: detail.priceLevel ?? null,
          businessStatus: detail.businessStatus ?? null,
          openNow: detail.currentOpeningHours?.openNow ?? null,
          photos: resolvedPhotos,
          reviews:
            detail.reviews?.map((review: any) => ({
              rating: review.rating ?? null,
              text:
                review.originalText?.text ??
                review.text?.text ??
                null,
              authorName: review.authorAttribution?.displayName ?? null,
              publishTime: review.publishTime ?? null,
            })) ?? null,
        };
      }),
    );

    return {
      history: {
        ...base,
        hasPlaceRecommendations: places.length > 0,
      },
      places,
    };
  }

  async getRecommendationDetailForUser(user: User, id: number) {
    const recommendation = await this.recommendationRepository.findOne({
      where: {
        id,
        user: { id: user.id },
      } as any,
      relations: ['placeRecommendations', 'user'],
    });

    if (!recommendation) {
      throw new BadRequestException('추천 이력을 찾을 수 없습니다.');
    }

    return this.buildRecommendationDetailResponse(recommendation);
  }

  async getRecommendationDetailForSocialLogin(
    socialLogin: SocialLogin,
    id: number,
  ) {
    const recommendation = await this.recommendationRepository.findOne({
      where: {
        id,
        socialLogin: { id: socialLogin.id },
      } as any,
      relations: ['placeRecommendations', 'socialLogin'],
    });

    if (!recommendation) {
      throw new BadRequestException('추천 이력을 찾을 수 없습니다.');
    }

    return this.buildRecommendationDetailResponse(recommendation);
  }

  async getPlaceDetail(placeId: string) {
    if (!GOOGLE_API_KEY) {
      this.logger.warn('GOOGLE_API_KEY가 설정되지 않았습니다.');
      throw new Error('GOOGLE_API_KEY가 설정되지 않았습니다.');
    }

    this.logger.log(`🔍 [Google Places 상세 조회] placeId="${placeId}"`);

    try {
      const response = await this.httpService
        .get(`${GOOGLE_PLACES_DETAILS_API_URL}/${placeId}`, {
          params: {
            languageCode: 'ko',
          },
          headers: {
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask':
              'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,businessStatus,photos,reviews,currentOpeningHours.openNow',
            Referer: 'http://localhost:3000',
          },
        })
        .toPromise();

      const place = response?.data ?? null;
      const resolvedPhotos = await this.resolvePhotoUris(place?.photos);

      return {
        place: place && {
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
            place.reviews?.map((review: any) => ({
              rating: review.rating ?? null,
              text:
                review.originalText?.text ??
                review.text?.text ??
                null,
              authorName: review.authorAttribution?.displayName ?? null,
              publishTime: review.publishTime ?? null,
            })) ?? null,
        },
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const statusCode = error?.response?.status;
      const errorData = error?.response?.data;
      this.logger.error(
        `❌ [Google Places 상세 조회 에러] placeId="${placeId}", status=${statusCode}, error=${message}`,
      );
      if (errorData) {
        this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
      }
      throw error;
    }
  }

  async recommendRestaurantsWithGooglePlacesAndLlmForUser(
    user: User,
    textQuery: string,
  ) {
    this.logger.log(
      `🔁 [가게 추천 플로우 시작] query="${textQuery}" - Google Places 검색 후 LLM 추천`,
    );
    const { places } = await this.searchRestaurantsWithGooglePlaces(textQuery);
    const recommendations =
      await this.openAiPlacesService.recommendFromGooglePlaces(
        textQuery,
        places,
      );

    // 이력을 MenuRecommendation / PlaceRecommendation 으로 저장
    const menuRecord = this.recommendationRepository.create({
      user,
      socialLogin: null,
      type: 'PLACE',
      prompt: textQuery,
      // Google 응답에서 온 이름/주소 등은 약관상 저장하지 않고,
      // 기존 recommendations 배열은 빈 배열로 유지
      recommendations: [],
      recommendedAt: new Date(),
      requestAddress: textQuery,
      requestLocationLat: null,
      requestLocationLng: null,
    });

    await this.recommendationRepository.save(menuRecord);

    const placeRecsToSave =
      recommendations.recommendations?.map((rec, index) =>
        this.placeRecommendationRepository.create({
          menuRecommendation: menuRecord,
          placeId: rec.placeId,
          reason: rec.reason,
          order: index + 1,
        }),
      ) ?? [];

    if (placeRecsToSave.length > 0) {
      await this.placeRecommendationRepository.save(placeRecsToSave);
    }

    this.logger.log(
      `✅ [가게 추천 플로우 완료] query="${textQuery}", recommended=${recommendations.recommendations.length}`,
    );
    return recommendations;
  }

  async recommendRestaurantsWithGooglePlacesAndLlmForSocialLogin(
    socialLogin: SocialLogin,
    textQuery: string,
  ) {
    this.logger.log(
      `🔁 [가게 추천 플로우 시작] query="${textQuery}" - Google Places 검색 후 LLM 추천 (소셜 로그인)`,
    );
    const { places } = await this.searchRestaurantsWithGooglePlaces(textQuery);
    const recommendations =
      await this.openAiPlacesService.recommendFromGooglePlaces(
        textQuery,
        places,
      );

    const menuRecord = this.recommendationRepository.create({
      user: null,
      socialLogin,
      type: 'PLACE',
      prompt: textQuery,
      recommendations: [],
      recommendedAt: new Date(),
      requestAddress: textQuery,
      requestLocationLat: null,
      requestLocationLng: null,
    });

    await this.recommendationRepository.save(menuRecord);

    const placeRecsToSave =
      recommendations.recommendations?.map((rec, index) =>
        this.placeRecommendationRepository.create({
          menuRecommendation: menuRecord,
          placeId: rec.placeId,
          reason: rec.reason,
          order: index + 1,
        }),
      ) ?? [];

    if (placeRecsToSave.length > 0) {
      await this.placeRecommendationRepository.save(placeRecsToSave);
    }

    this.logger.log(
      `✅ [가게 추천 플로우 완료] query="${textQuery}", recommended=${recommendations.recommendations.length} (소셜 로그인)`,
    );
    return recommendations;
  }

  /**
   * Google Programmable Search Engine(JSON API)를 사용하여
   * 가게 이름 기반 블로그/웹 문서 검색 결과를 조회
   */
  async searchRestaurantBlogs(query: string) {
    if (!GOOGLE_API_KEY || !GOOGLE_CSE_CX) {
      this.logger.warn(
        'GOOGLE_API_KEY 또는 GOOGLE_CSE_CX가 설정되지 않았습니다.',
      );
      throw new Error(
        'GOOGLE_API_KEY 또는 GOOGLE_CSE_CX가 설정되지 않았습니다.',
      );
    }

    this.logger.log(`🔍 [Custom Search 블로그 검색] query="${query}"`);

    try {
      const response = await this.httpService
        .get(GOOGLE_CSE_API_URL, {
          params: {
            key: GOOGLE_API_KEY,
            cx: GOOGLE_CSE_CX,
            q: query,
            num: 5,
            hl: 'ko',
          },
          headers: {
            Referer: 'http://localhost:3000',
          },
        })
        .toPromise();

      const items = response?.data?.items || [];

      const blogs = items.map((item: any) => {
        const pagemap = item.pagemap || {};
        const thumbnail =
          pagemap.cse_thumbnail?.[0]?.src ??
          pagemap.metatags?.[0]?.['og:image'] ??
          null;
        const source =
          pagemap.metatags?.[0]?.['og:site_name'] ??
          item.displayLink ??
          null;

        return {
          title: item.title ?? null,
          url: item.link ?? null,
          snippet: item.snippet ?? null,
          thumbnailUrl: thumbnail,
          source,
        };
      });

      this.logger.log(
        `✅ [Custom Search 블로그 검색 응답] count=${blogs.length}`,
      );
      return { blogs };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const statusCode = error?.response?.status;
      const errorData = error?.response?.data;
      this.logger.error(
        `❌ [Custom Search 블로그 검색 에러] query="${query}", status=${statusCode}, error=${message}`,
      );
      if (errorData) {
        this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
      }
      throw error;
    }
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
