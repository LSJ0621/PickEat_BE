import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialLogin } from '../user/entities/social-login.entity';
import { User } from '../user/entities/user.entity';
import { UpdateMenuSelectionDto } from './dto/update-menu-selection.dto';
import { MenuRecommendation } from './entities/menu-recommendation.entity';
import {
  MenuSelection,
  MenuSelectionStatus,
} from './entities/menu-selection.entity';
import { PlaceRecommendation } from './entities/place-recommendation.entity';
import {
  buildMenuPayloadFromSlotInputs,
  mergeMenuPayload,
  normalizeMenuName,
  normalizeMenuPayload,
} from './menu-payload.util';
import { OpenAiMenuService } from './openai-menu.service';
import { OpenAiPlacesService } from './openai-places.service';

const GOOGLE_PLACES_API_URL =
  'https://places.googleapis.com/v1/places:searchText';
const GOOGLE_PLACES_DETAILS_API_URL = 'https://places.googleapis.com/v1/places';
const GOOGLE_PLACES_PHOTO_MEDIA_URL = 'https://places.googleapis.com/v1';
const GOOGLE_CSE_API_URL = 'https://www.googleapis.com/customsearch/v1';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);
  // 환경변수에서 읽어오는 키들 (ConfigService 사용)
  private readonly googleApiKey: string;
  private readonly googleCseCx: string;

  constructor(
    @InjectRepository(MenuRecommendation)
    private readonly recommendationRepository: Repository<MenuRecommendation>,
    @InjectRepository(PlaceRecommendation)
    private readonly placeRecommendationRepository: Repository<PlaceRecommendation>,
    @InjectRepository(MenuSelection)
    private readonly menuSelectionRepository: Repository<MenuSelection>,
    private readonly openAiMenuService: OpenAiMenuService,
    private readonly openAiPlacesService: OpenAiPlacesService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    // .env.development 기준:
    // GOOGLE_API_KEY=...
    // GOOGLE_CSE_CX=...
    this.googleApiKey = this.config.get<string>('GOOGLE_API_KEY', '');
    this.googleCseCx = this.config.get<string>('GOOGLE_CSE_CX', '');
  }

  async recommendForUser(
    user: User,
    prompt: string,
    requestAddress?: string,
    requestLocationLat?: number,
    requestLocationLng?: number,
  ) {
    // 좋아하는 것, 싫어하는 것, 취향 분석을 모두 전달
    const likes = user.preferences?.likes ?? [];
    const dislikes = user.preferences?.dislikes ?? [];
    const analysis = user.preferences?.analysis;
    const recommendations =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );
    const record = this.recommendationRepository.create({
      user,
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

  async recommendForSocialLogin(
    socialLogin: SocialLogin,
    prompt: string,
    requestAddress?: string,
    requestLocationLat?: number,
    requestLocationLng?: number,
  ) {
    // 좋아하는 것, 싫어하는 것, 취향 분석을 모두 전달
    const likes = socialLogin.preferences?.likes ?? [];
    const dislikes = socialLogin.preferences?.dislikes ?? [];
    const analysis = socialLogin.preferences?.analysis;
    const recommendations =
      await this.openAiMenuService.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );
    const record = this.recommendationRepository.create({
      socialLogin,
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

  async createSelectionForUser(
    user: User,
    menus: Array<{ slot: string; name: string }>,
    historyId?: number,
  ): Promise<MenuSelection> {
    if (!menus || menus.length === 0) {
      throw new BadRequestException('메뉴가 비어있습니다.');
    }

    // slot별로 메뉴 그룹화 및 정규화
    const menuPayload = buildMenuPayloadFromSlotInputs(menus);

    // 최소 하나의 메뉴가 있어야 함
    const totalMenus =
      menuPayload.breakfast.length +
      menuPayload.lunch.length +
      menuPayload.dinner.length +
      menuPayload.etc.length;

    if (totalMenus === 0) {
      throw new BadRequestException('유효한 메뉴가 없습니다.');
    }

    const now = new Date();
    const selectedDate = this.toDateString(now);

    // 같은 날짜의 레코드 찾기 (status 상관 없이)
    const existing = await this.menuSelectionRepository.findOne({
      where: {
        user: { id: user.id },
        selectedDate,
      },
      relations: ['user'],
    });

    if (existing) {
      // 기존 payload와 새 payload를 slot별로 merge (추가/중복 제거)
      const existingPayload = normalizeMenuPayload(existing.menuPayload);
      existing.menuPayload = mergeMenuPayload(existingPayload, menuPayload);
      existing.selectedAt = now;
      existing.selectedDate = selectedDate;
      existing.status = MenuSelectionStatus.PENDING;
      existing.lastTriedAt = null;
      existing.retryCount = 0;
      if (historyId !== undefined) {
        existing.menuRecommendation = await this.findOwnedRecommendationForUser(
          historyId,
          user.id,
        );
      }
      return this.menuSelectionRepository.save(existing);
    }

    // 새 레코드 생성
    const selection = this.menuSelectionRepository.create({
      menuPayload,
      user,
      socialLogin: null,
      selectedAt: now,
      selectedDate,
      status: MenuSelectionStatus.PENDING,
      lastTriedAt: null,
      retryCount: 0,
    });

    if (historyId !== undefined) {
      selection.menuRecommendation = await this.findOwnedRecommendationForUser(
        historyId,
        user.id,
      );
    }

    return this.menuSelectionRepository.save(selection);
  }

  async updateSelectionForUser(
    user: User,
    selectionId: number,
    dto: UpdateMenuSelectionDto,
  ) {
    const selection = await this.menuSelectionRepository.findOne({
      where: { id: selectionId, user: { id: user.id } },
      relations: ['user'],
    });
    if (!selection) {
      throw new BadRequestException('선택 이력을 찾을 수 없습니다.');
    }

    const now = new Date();
    const selectedDate = this.toDateString(now);

    if (dto.cancel) {
      await this.menuSelectionRepository.update(selection.id, {
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: { breakfast: [], lunch: [], dinner: [], etc: [] },
        selectedAt: now,
        selectedDate: selectedDate,
        lastTriedAt: null,
        retryCount: 0,
      });
    } else {
      // 기존 payload 가져오기
      const existingPayload = normalizeMenuPayload(selection.menuPayload);
      const updatedPayload = {
        breakfast: [...existingPayload.breakfast],
        lunch: [...existingPayload.lunch],
        dinner: [...existingPayload.dinner],
        etc: [...existingPayload.etc],
      };

      const hasAnySlotUpdate =
        dto.breakfast !== undefined ||
        dto.lunch !== undefined ||
        dto.dinner !== undefined ||
        dto.etc !== undefined;

      if (!hasAnySlotUpdate) {
        throw new BadRequestException('변경할 메뉴가 없습니다.');
      }

      if (dto.breakfast !== undefined) {
        const normalized = dto.breakfast
          .map((m) => normalizeMenuName(m))
          .filter((m) => m.length > 0);
        updatedPayload.breakfast = normalized;
      }

      if (dto.lunch !== undefined) {
        const normalized = dto.lunch
          .map((m) => normalizeMenuName(m))
          .filter((m) => m.length > 0);
        updatedPayload.lunch = normalized;
      }

      if (dto.dinner !== undefined) {
        const normalized = dto.dinner
          .map((m) => normalizeMenuName(m))
          .filter((m) => m.length > 0);
        updatedPayload.dinner = normalized;
      }

      if (dto.etc !== undefined) {
        const normalized = dto.etc
          .map((m) => normalizeMenuName(m))
          .filter((m) => m.length > 0);
        updatedPayload.etc = normalized;
      }

      await this.menuSelectionRepository.update(selection.id, {
        menuPayload: updatedPayload,
        status: MenuSelectionStatus.PENDING,
        selectedAt: now,
        selectedDate: selectedDate,
        lastTriedAt: null,
        retryCount: 0,
      });
    }

    // 업데이트 후 다시 조회하여 반환
    const updated = await this.menuSelectionRepository.findOne({
      where: { id: selection.id },
    });
    if (!updated) {
      throw new BadRequestException('업데이트된 선택 이력을 찾을 수 없습니다.');
    }
    return updated;
  }

  async createSelectionForSocialLogin(
    socialLogin: SocialLogin,
    menus: Array<{ slot: string; name: string }>,
    historyId?: number,
  ): Promise<MenuSelection> {
    if (!menus || menus.length === 0) {
      throw new BadRequestException('메뉴가 비어있습니다.');
    }

    // slot별로 메뉴 그룹화 및 정규화
    const menuPayload = buildMenuPayloadFromSlotInputs(menus);

    // 최소 하나의 메뉴가 있어야 함
    const totalMenus =
      menuPayload.breakfast.length +
      menuPayload.lunch.length +
      menuPayload.dinner.length +
      menuPayload.etc.length;

    if (totalMenus === 0) {
      throw new BadRequestException('유효한 메뉴가 없습니다.');
    }

    const now = new Date();
    const selectedDate = this.toDateString(now);

    // 같은 날짜의 레코드 찾기 (status 상관 없이)
    const existing = await this.menuSelectionRepository.findOne({
      where: {
        socialLogin: { id: socialLogin.id },
        selectedDate,
      },
      relations: ['socialLogin'],
    });

    if (existing) {
      // 기존 payload와 새 payload를 slot별로 merge (추가/중복 제거)
      const existingPayload = normalizeMenuPayload(existing.menuPayload);
      existing.menuPayload = mergeMenuPayload(existingPayload, menuPayload);
      existing.selectedAt = now;
      existing.selectedDate = selectedDate;
      existing.status = MenuSelectionStatus.PENDING;
      existing.lastTriedAt = null;
      existing.retryCount = 0;
      if (historyId !== undefined) {
        existing.menuRecommendation =
          await this.findOwnedRecommendationForSocialLogin(
            historyId,
            socialLogin.id,
          );
      }
      return this.menuSelectionRepository.save(existing);
    }

    // 새 레코드 생성
    const selection = this.menuSelectionRepository.create({
      menuPayload,
      user: null,
      socialLogin,
      selectedAt: now,
      selectedDate,
      status: MenuSelectionStatus.PENDING,
      lastTriedAt: null,
      retryCount: 0,
    });

    if (historyId !== undefined) {
      selection.menuRecommendation =
        await this.findOwnedRecommendationForSocialLogin(
          historyId,
          socialLogin.id,
        );
    }

    return this.menuSelectionRepository.save(selection);
  }

  async updateSelectionForSocialLogin(
    socialLogin: SocialLogin,
    selectionId: number,
    dto: UpdateMenuSelectionDto,
  ) {
    const selection = await this.menuSelectionRepository.findOne({
      where: { id: selectionId, socialLogin: { id: socialLogin.id } },
      relations: ['socialLogin'],
    });
    if (!selection) {
      throw new BadRequestException('선택 이력을 찾을 수 없습니다.');
    }

    const now = new Date();
    const selectedDate = this.toDateString(now);

    if (dto.cancel) {
      await this.menuSelectionRepository.update(selection.id, {
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: { breakfast: [], lunch: [], dinner: [], etc: [] },
        selectedAt: now,
        selectedDate: selectedDate,
        lastTriedAt: null,
        retryCount: 0,
      });
    } else {
      // 기존 payload 가져오기
      const existingPayload = normalizeMenuPayload(selection.menuPayload);
      const updatedPayload = {
        breakfast: [...existingPayload.breakfast],
        lunch: [...existingPayload.lunch],
        dinner: [...existingPayload.dinner],
        etc: [...existingPayload.etc],
      };

      const hasAnySlotUpdate =
        dto.breakfast !== undefined ||
        dto.lunch !== undefined ||
        dto.dinner !== undefined ||
        dto.etc !== undefined;

      if (!hasAnySlotUpdate) {
        throw new BadRequestException('변경할 메뉴가 없습니다.');
      }

      if (dto.breakfast !== undefined) {
        const normalized = dto.breakfast
          .map((m) => normalizeMenuName(m))
          .filter((m) => m.length > 0);
        updatedPayload.breakfast = normalized;
      }

      if (dto.lunch !== undefined) {
        const normalized = dto.lunch
          .map((m) => normalizeMenuName(m))
          .filter((m) => m.length > 0);
        updatedPayload.lunch = normalized;
      }

      if (dto.dinner !== undefined) {
        const normalized = dto.dinner
          .map((m) => normalizeMenuName(m))
          .filter((m) => m.length > 0);
        updatedPayload.dinner = normalized;
      }

      if (dto.etc !== undefined) {
        const normalized = dto.etc
          .map((m) => normalizeMenuName(m))
          .filter((m) => m.length > 0);
        updatedPayload.etc = normalized;
      }

      await this.menuSelectionRepository.update(selection.id, {
        menuPayload: updatedPayload,
        status: MenuSelectionStatus.PENDING,
        selectedAt: now,
        selectedDate: selectedDate,
        lastTriedAt: null,
        retryCount: 0,
      });
    }

    // 업데이트 후 다시 조회하여 반환
    const updated = await this.menuSelectionRepository.findOne({
      where: { id: selection.id },
    });
    if (!updated) {
      throw new BadRequestException('업데이트된 선택 이력을 찾을 수 없습니다.');
    }
    return updated;
  }

  async getHistory(user: User, date?: string) {
    const qb = this.recommendationRepository
      .createQueryBuilder('recommendation')
      .leftJoinAndSelect(
        'recommendation.placeRecommendations',
        'placeRecommendation',
      )
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
      .leftJoinAndSelect(
        'recommendation.placeRecommendations',
        'placeRecommendation',
      )
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
    if (!this.googleApiKey) {
      this.logger.warn('this.googleApiKey가 설정되지 않았습니다.');
      throw new Error('this.googleApiKey가 설정되지 않았습니다.');
    }

    const body: any = {
      textQuery,
      languageCode: 'ko',
      maxResultCount: 10,
    };

    this.logger.log(`🔍 [Google Places 텍스트 검색] query="${textQuery}"`);

    try {
      const response = await this.httpService
        .post(GOOGLE_PLACES_API_URL, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.googleApiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.reviews',
            Referer: 'http://localhost:3000',
          },
        })
        .toPromise();

      const places = response?.data?.places || [];

      const result = places.map((place: any) => ({
        id: place.id,
        name: place.displayName?.text ?? null,
        rating: place.rating ?? null,
        userRatingCount: place.userRatingCount ?? null,
        priceLevel: place.priceLevel ?? null,
        reviews:
          place.reviews?.map((review: any) => ({
            rating: review.rating ?? null,
            originalText:
              review.originalText?.text ?? review.text?.text ?? null,
            relativePublishTimeDescription:
              review.relativePublishTimeDescription ?? null,
          })) ?? null,
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

    if (!this.googleApiKey) {
      this.logger.warn(
        'this.googleApiKey가 설정되지 않아 사진 URL을 생성할 수 없습니다.',
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
              key: this.googleApiKey,
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
        const message =
          error instanceof Error ? error.message : 'unknown error';
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
    if (!this.googleApiKey || placeRecs.length === 0) {
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
              'X-Goog-Api-Key': this.googleApiKey,
              'X-Goog-FieldMask':
                'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,photos,reviews,currentOpeningHours.openNow',
              Referer: 'http://localhost:3000',
            },
          })
          .toPromise();
        return response?.data ?? null;
      } catch (error: any) {
        const message =
          error instanceof Error ? error.message : 'unknown error';
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
          menuName: pr.menuName,
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
              text: review.originalText?.text ?? review.text?.text ?? null,
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
    if (!this.googleApiKey) {
      this.logger.warn('this.googleApiKey가 설정되지 않았습니다.');
      throw new Error('this.googleApiKey가 설정되지 않았습니다.');
    }

    this.logger.log(`🔍 [Google Places 상세 조회] placeId="${placeId}"`);

    try {
      const response = await this.httpService
        .get(`${GOOGLE_PLACES_DETAILS_API_URL}/${placeId}`, {
          params: {
            languageCode: 'ko',
          },
          headers: {
            'X-Goog-Api-Key': this.googleApiKey,
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
              text: review.originalText?.text ?? review.text?.text ?? null,
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

    const menuRecord = await this.recommendationRepository.findOne({
      where: {
        id: menuRecommendationId,
        user: { id: user.id },
      } as any,
      relations: ['placeRecommendations'],
    });

    if (!menuRecord) {
      throw new BadRequestException(
        '연결할 메뉴 추천 이력을 찾을 수 없습니다.',
      );
    }

    if (
      menuRecord.placeRecommendations?.some((pr) => pr.menuName === menuName)
    ) {
      throw new BadRequestException(
        '이 메뉴는 이미 AI 가게 추천을 받았습니다. 기존 결과를 확인하세요.',
      );
    }

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
          placeId: rec.placeId,
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

  async recommendRestaurantsWithGooglePlacesAndLlmForSocialLogin(
    socialLogin: SocialLogin,
    textQuery: string,
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

    const menuRecord = await this.recommendationRepository.findOne({
      where: {
        id: menuRecommendationId,
        socialLogin: { id: socialLogin.id },
      } as any,
      relations: ['placeRecommendations'],
    });

    if (!menuRecord) {
      throw new BadRequestException(
        '연결할 메뉴 추천 이력을 찾을 수 없습니다.',
      );
    }

    if (
      menuRecord.placeRecommendations?.some((pr) => pr.menuName === menuName)
    ) {
      throw new BadRequestException(
        '이 메뉴는 이미 AI 가게 추천을 받았습니다. 기존 결과를 확인하세요.',
      );
    }

    this.logger.log(
      `🔁 [가게 추천 플로우 시작] query="${textQuery}" - Google Places 검색 후 LLM 추천 (소셜 로그인)`,
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
          placeId: rec.placeId,
          reason: rec.reason,
          menuName,
        }),
      ) ?? [],
    );

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
    if (!this.googleApiKey || !this.googleCseCx) {
      this.logger.warn(
        'this.googleApiKey 또는 this.googleCseCx가 설정되지 않았습니다.',
      );
      throw new Error(
        'this.googleApiKey 또는 this.googleCseCx가 설정되지 않았습니다.',
      );
    }

    this.logger.log(`🔍 [Custom Search 블로그 검색] query="${query}"`);

    try {
      const response = await this.httpService
        .get(GOOGLE_CSE_API_URL, {
          params: {
            key: this.googleApiKey,
            cx: this.googleCseCx,
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
          pagemap.metatags?.[0]?.['og:site_name'] ?? item.displayLink ?? null;

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

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  async getSelectionsForUser(user: User, selectedDate?: string) {
    const where: any = { user: { id: user.id } };
    if (selectedDate) {
      where.selectedDate = selectedDate;
    }
    const selections = await this.menuSelectionRepository.find({
      where,
      order: { selectedAt: 'DESC' },
      relations: ['menuRecommendation'],
    });
    return selections.map((selection) => this.mapSelection(selection));
  }

  async getSelectionsForSocialLogin(
    socialLogin: SocialLogin,
    selectedDate?: string,
  ) {
    const where: any = { socialLogin: { id: socialLogin.id } };
    if (selectedDate) {
      where.selectedDate = selectedDate;
    }
    const selections = await this.menuSelectionRepository.find({
      where,
      order: { selectedAt: 'DESC' },
      relations: ['menuRecommendation'],
    });
    return selections.map((selection) => this.mapSelection(selection));
  }

  private mapSelection(selection: MenuSelection) {
    const normalizedPayload = normalizeMenuPayload(selection.menuPayload);
    return {
      id: selection.id,
      menuPayload: normalizedPayload,
      selectedDate: selection.selectedDate,
    };
  }

  private async findOwnedRecommendationForUser(
    historyId: number,
    userId: number,
  ): Promise<MenuRecommendation> {
    const recommendation = await this.recommendationRepository.findOne({
      where: { id: historyId, user: { id: userId } },
      relations: ['user'],
    });
    if (!recommendation) {
      throw new BadRequestException(
        '본인 추천 이력에만 선택을 연결할 수 있습니다.',
      );
    }
    return recommendation;
  }

  private async findOwnedRecommendationForSocialLogin(
    historyId: number,
    socialLoginId: number,
  ): Promise<MenuRecommendation> {
    const recommendation = await this.recommendationRepository.findOne({
      where: { id: historyId, socialLogin: { id: socialLoginId } },
      relations: ['socialLogin'],
    });
    if (!recommendation) {
      throw new BadRequestException(
        '본인 추천 이력에만 선택을 연결할 수 있습니다.',
      );
    }
    return recommendation;
  }
}
