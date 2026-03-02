import {
  BadRequestException,
  HttpException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  AuthUserPayload,
  CurrentUser,
} from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { ErrorCode } from '@/common/constants/error-codes';
import { SSE_CONFIG } from '@/common/constants/business.constants';
import { streamingAsyncLocalStorage } from '@/common/utils/retry-context';
import { isAbortError } from '@/common/utils/retry.util';
import { parseLanguage } from '@/common/utils/language.util';
import { UserService } from '@/user/user.service';
import { CreateMenuSelectionDto } from './dto/create-menu-selection.dto';
import { RecommendCommunityPlacesDto } from './dto/recommend-community-places.dto';
import { RecommendMenuDto } from './dto/recommend-menu.dto';
import { RecommendPlacesV2Dto } from './dto/recommend-places-v2.dto';
import { RecommendationHistoryQueryDto } from './dto/recommendation-history-query.dto';
import { SearchRestaurantBlogsDto } from './dto/search-restaurant-blogs.dto';
import { UpdateMenuSelectionDto } from './dto/update-menu-selection.dto';
import { MenuSelection } from './entities/menu-selection.entity';
import { PlaceRecommendationSource } from './enum/place-recommendation-source.enum';
import { PlaceRecommendationResponse } from './interfaces/place-recommendation-response.interface';
import { MenuService } from './menu.service';
import { CommunityPlaceService } from './services/community-place.service';
import { MenuRecommendationService } from './services/menu-recommendation.service';
import { PlaceService } from './services/place.service';

@Controller('menu')
@UseGuards(JwtAuthGuard)
export class MenuController {
  private readonly logger = new Logger(MenuController.name);

  constructor(
    private readonly menuService: MenuService,
    private readonly userService: UserService,
    private readonly placeService: PlaceService,
    private readonly communityPlaceService: CommunityPlaceService,
    private readonly menuRecommendationService: MenuRecommendationService,
  ) {}

  @Post('recommend')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async recommend(
    @Body() recommendMenuDto: RecommendMenuDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    return this.menuService.recommend(entity, recommendMenuDto.prompt);
  }

  @Post('selections')
  async createSelection(
    @Body() createMenuSelectionDto: CreateMenuSelectionDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const selection = await this.menuService.createSelection(
      entity,
      createMenuSelectionDto.menus,
      createMenuSelectionDto.historyId,
    );
    return this.buildSelectionResponse(selection);
  }

  @Get('selections/history')
  async getSelections(
    @Query('date') date: string | undefined,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const selections = await this.menuService.getSelections(entity, date);
    return { selections };
  }

  @Patch('selections/:id')
  async updateSelection(
    @Param('id') id: string,
    @Body() updateDto: UpdateMenuSelectionDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const selectionId = Number(id);
    if (Number.isNaN(selectionId)) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_INVALID_SELECTION_ID,
      });
    }
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const selection = await this.menuService.updateSelection(
      entity,
      selectionId,
      updateDto,
    );
    return this.buildSelectionResponse(selection);
  }

  @Get('recommendations/history')
  async getHistory(
    @Query() query: RecommendationHistoryQueryDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    return this.menuService.getHistory(
      entity,
      query.page,
      query.limit,
      query.date,
    );
  }

  // Google Custom Search(Programmable Search)를 이용한
  // 가게 이름 기반 블로그/웹 문서 검색 (썸네일, URL, 제목, 스니펫, 출처)
  // 예: GET /menu/restaurant/blogs?query=부산시 해운대구 마라탕집&restaurantName=마라탕집&language=ko
  @Get('restaurant/blogs')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async searchRestaurantBlogs(@Query() dto: SearchRestaurantBlogsDto) {
    return this.menuService.searchRestaurantBlogs(
      dto.query,
      dto.restaurantName,
      dto.language,
      dto.searchName,
      dto.searchAddress,
    );
  }

  // 검색 기반 가게 추천 (Gemini with Google Search Grounding)
  @Get('recommend/places/search')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async recommendSearchPlaces(
    @Query() dto: RecommendCommunityPlacesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ): Promise<PlaceRecommendationResponse> {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );

    // Validate MenuRecommendation exists and belongs to user
    await this.menuRecommendationService.findById(
      dto.menuRecommendationId,
      entity,
    );

    const textQuery = dto.menuName;

    // Use Gemini-based place recommendation with coordinates
    const result = await this.placeService.recommendRestaurants(
      entity,
      textQuery,
      dto.menuName,
      dto.menuRecommendationId,
      dto.latitude,
      dto.longitude,
    );

    // Map Gemini response (통합 Grounding: Search + Maps)
    const language = parseLanguage(entity.preferredLanguage);
    return this.mapGeminiRecommendationResponse(result, language);
  }

  // 커뮤니티 등록 가게 추천 (UserPlace)
  @Get('recommend/places/community')
  async recommendCommunityPlaces(
    @Query() dto: RecommendCommunityPlacesDto,
    @CurrentUser() authUser: AuthUserPayload,
  ): Promise<PlaceRecommendationResponse> {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );

    // Get MenuRecommendation (findById throws NotFoundException if not found)
    const menuRecommendation = await this.menuRecommendationService.findById(
      dto.menuRecommendationId,
      entity,
    );

    // Parse language
    const language = parseLanguage(dto.language || entity.preferredLanguage);

    // Call CommunityPlaceService
    const placeRecommendations =
      await this.communityPlaceService.recommendCommunityPlaces(
        entity,
        dto.latitude,
        dto.longitude,
        dto.menuName,
        menuRecommendation,
        language,
      );

    // Transform PlaceRecommendation[] to match frontend expected format
    return {
      recommendations: placeRecommendations.map((rec) => ({
        placeId: rec.placeId,
        name: rec.userPlace?.name || '',
        reason: rec.reason,
        reasonTags: rec.reasonTags ?? [],
        menuName: rec.menuName || undefined,
        source: rec.source,
        userPlaceId: rec.userPlace?.id || undefined,
      })),
    };
  }

  // Gemini 기반 가게 추천 (V2)
  @Get('recommend/places/v2')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async recommendPlacesV2(
    @Query() dto: RecommendPlacesV2Dto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const language = parseLanguage(entity.preferredLanguage);
    const result = await this.menuService.recommendPlacesWithGemini(
      dto,
      entity.id,
      entity.preferredLanguage,
    );
    return {
      ...this.mapGeminiRecommendationResponse(result, language),
      searchEntryPointHtml: result.searchEntryPointHtml,
      googleMapsWidgetContextToken: result.googleMapsWidgetContextToken,
    };
  }

  // 특정 추천 이력 1건 + 그 이력에서 생성된 AI 가게 추천 상세 조회
  // 예: GET /menu/recommendations/123
  @Get('recommendations/:id')
  async getRecommendationDetail(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      throw new BadRequestException({
        errorCode: ErrorCode.MENU_INVALID_HISTORY_ID,
      });
    }
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    return this.menuService.getRecommendationDetail(entity, numericId);
  }

  // 단일 placeId에 대한 Google Places 상세 조회
  // 예: GET /menu/places/:placeId/detail
  @Get('places/:placeId/detail')
  async getPlaceDetail(
    @Param('placeId') placeId: string,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const entity = await this.userService.getAuthenticatedEntity(
      authUser.email,
    );
    const language = parseLanguage(entity.preferredLanguage);
    return this.menuService.getPlaceDetail(placeId, language);
  }

  // SSE streaming: 메뉴 추천 (retry/status 이벤트 포함)
  @Post('recommend/stream')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async recommendStream(
    @Body() recommendMenuDto: RecommendMenuDto,
    @CurrentUser() authUser: AuthUserPayload,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientDisconnected = false;
    const abortController = new AbortController();

    const safeSendEvent = (event: Record<string, unknown>) => {
      if (!clientDisconnected && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    const closeHandler = () => {
      clientDisconnected = true;
    };
    req.on('close', closeHandler);

    const timeout = setTimeout(() => {
      if (!res.writableEnded) {
        safeSendEvent({ type: 'error', message: 'Server timeout' });
        abortController.abort();
      }
    }, SSE_CONFIG.SERVER_TIMEOUT_MS);

    try {
      if (abortController.signal.aborted) return;
      const entity = await this.userService.getAuthenticatedEntity(
        authUser.email,
      );
      if (abortController.signal.aborted) return;
      const result = await streamingAsyncLocalStorage.run(
        {
          onRetry: (attempt) => safeSendEvent({ type: 'retrying', attempt }),
          onStatus: (status) => safeSendEvent({ type: 'status', status }),
          signal: abortController.signal,
        },
        () => this.menuService.recommend(entity, recommendMenuDto.prompt),
      );
      safeSendEvent({ type: 'result', data: result });
    } catch (error) {
      if (!isAbortError(error) && !res.writableEnded) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        const errorCode =
          error instanceof HttpException
            ? ((error.getResponse() as Record<string, unknown>)?.errorCode as string | undefined)
            : undefined;
        safeSendEvent({
          type: 'error',
          message,
          ...(errorCode && { errorCode }),
        });
      }
    } finally {
      clearTimeout(timeout);
      req.removeListener('close', closeHandler);
      if (!res.writableEnded) res.end();
    }
  }

  // SSE streaming: 검색 기반 가게 추천 (retry/status 이벤트 포함)
  @Get('recommend/places/search/stream')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async recommendSearchPlacesStream(
    @Query() dto: RecommendCommunityPlacesDto,
    @CurrentUser() authUser: AuthUserPayload,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientDisconnected = false;
    const abortController = new AbortController();

    const safeSendEvent = (event: Record<string, unknown>) => {
      if (!clientDisconnected && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    const closeHandler = () => {
      clientDisconnected = true;
    };
    req.on('close', closeHandler);

    const timeout = setTimeout(() => {
      if (!res.writableEnded) {
        safeSendEvent({ type: 'error', message: 'Server timeout' });
        abortController.abort();
      }
    }, SSE_CONFIG.SERVER_TIMEOUT_MS);

    try {
      if (abortController.signal.aborted) return;
      const entity = await this.userService.getAuthenticatedEntity(
        authUser.email,
      );

      if (abortController.signal.aborted) return;
      await this.menuRecommendationService.findById(
        dto.menuRecommendationId,
        entity,
      );

      if (abortController.signal.aborted) return;
      const textQuery = dto.menuName;

      const result = await streamingAsyncLocalStorage.run(
        {
          onRetry: (attempt) => safeSendEvent({ type: 'retrying', attempt }),
          onStatus: (status) => safeSendEvent({ type: 'status', status }),
          signal: abortController.signal,
        },
        async () => {
          safeSendEvent({ type: 'status', status: 'searching' });
          return this.placeService.recommendRestaurants(
            entity,
            textQuery,
            dto.menuName,
            dto.menuRecommendationId,
            dto.latitude,
            dto.longitude,
          );
        },
      );

      const language = parseLanguage(entity.preferredLanguage);
      const response: PlaceRecommendationResponse =
        this.mapGeminiRecommendationResponse(result, language);
      safeSendEvent({ type: 'result', data: response });
    } catch (error) {
      if (!isAbortError(error) && !res.writableEnded) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        const errorCode =
          error instanceof HttpException
            ? ((error.getResponse() as Record<string, unknown>)?.errorCode as string | undefined)
            : undefined;
        safeSendEvent({
          type: 'error',
          message,
          ...(errorCode && { errorCode }),
        });
      }
    } finally {
      clearTimeout(timeout);
      req.removeListener('close', closeHandler);
      if (!res.writableEnded) res.end();
    }
  }

  // SSE streaming: 커뮤니티 가게 추천 (retry/status 이벤트 포함)
  @Get('recommend/places/community/stream')
  async recommendCommunityPlacesStream(
    @Query() dto: RecommendCommunityPlacesDto,
    @CurrentUser() authUser: AuthUserPayload,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientDisconnected = false;
    const abortController = new AbortController();

    const safeSendEvent = (event: Record<string, unknown>) => {
      if (!clientDisconnected && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    const closeHandler = () => {
      clientDisconnected = true;
    };
    req.on('close', closeHandler);

    const timeout = setTimeout(() => {
      if (!res.writableEnded) {
        safeSendEvent({ type: 'error', message: 'Server timeout' });
        abortController.abort();
      }
    }, SSE_CONFIG.SERVER_TIMEOUT_MS);

    try {
      if (abortController.signal.aborted) return;
      const entity = await this.userService.getAuthenticatedEntity(
        authUser.email,
      );

      if (abortController.signal.aborted) return;
      // findById throws NotFoundException if not found
      const menuRecommendation = await this.menuRecommendationService.findById(
        dto.menuRecommendationId,
        entity,
      );

      if (abortController.signal.aborted) return;
      const language = parseLanguage(dto.language || entity.preferredLanguage);

      const placeRecommendations = await streamingAsyncLocalStorage.run(
        {
          onRetry: (attempt) => safeSendEvent({ type: 'retrying', attempt }),
          onStatus: (status) => safeSendEvent({ type: 'status', status }),
          signal: abortController.signal,
        },
        async () => {
          safeSendEvent({ type: 'status', status: 'searching' });
          return this.communityPlaceService.recommendCommunityPlaces(
            entity,
            dto.latitude,
            dto.longitude,
            dto.menuName,
            menuRecommendation,
            language,
          );
        },
      );

      const response: PlaceRecommendationResponse = {
        recommendations: placeRecommendations.map((rec) => ({
          placeId: rec.placeId,
          name: rec.userPlace?.name || '',
          reason: rec.reason,
          reasonTags: rec.reasonTags ?? [],
          menuName: rec.menuName || undefined,
          source: rec.source,
          userPlaceId: rec.userPlace?.id || undefined,
        })),
      };
      safeSendEvent({ type: 'result', data: response });
    } catch (error) {
      if (!isAbortError(error) && !res.writableEnded) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        const errorCode =
          error instanceof HttpException
            ? ((error.getResponse() as Record<string, unknown>)?.errorCode as string | undefined)
            : undefined;
        safeSendEvent({
          type: 'error',
          message,
          ...(errorCode && { errorCode }),
        });
      }
    } finally {
      clearTimeout(timeout);
      req.removeListener('close', closeHandler);
      if (!res.writableEnded) res.end();
    }
  }

  private mapGeminiRecommendationResponse(
    result: {
      recommendations: Array<{
        placeId: string | null;
        nameKo: string;
        nameEn: string;
        nameLocal?: string | null;
        reason: string;
        reasonTags?: string[];
        menuName?: string;
        addressKo?: string;
        addressEn?: string;
        addressLocal?: string | null;
        location?: { latitude: number; longitude: number };
        searchName?: string;
        searchAddress?: string;
      }>;
    },
    language: 'ko' | 'en',
  ): PlaceRecommendationResponse {
    return {
      recommendations: result.recommendations.map((rec) => ({
        placeId: rec.placeId,
        name: language === 'ko' ? rec.nameKo : rec.nameEn,
        reason: rec.reason,
        reasonTags: rec.reasonTags ?? [],
        menuName: rec.menuName,
        source: PlaceRecommendationSource.GEMINI,
        address: language === 'ko' ? rec.addressKo : rec.addressEn,
        location: rec.location,
        localizedName:
          rec.nameLocal ?? (language === 'ko' ? rec.nameEn : rec.nameKo),
        localizedAddress:
          rec.addressLocal ??
          (language === 'ko' ? rec.addressEn : rec.addressKo),
        searchName: rec.searchName,
        searchAddress: rec.searchAddress,
      })),
    };
  }

  private buildSelectionResponse(selection: MenuSelection) {
    // menuPayload를 그대로 반환 (slot별 구조)
    const payload = selection.menuPayload;
    const normalizedPayload = {
      breakfast: Array.isArray(payload?.breakfast) ? payload.breakfast : [],
      lunch: Array.isArray(payload?.lunch) ? payload.lunch : [],
      dinner: Array.isArray(payload?.dinner) ? payload.dinner : [],
      etc: Array.isArray(payload?.etc) ? payload.etc : [],
    };
    return {
      selection: {
        id: selection.id,
        menuPayload: normalizedPayload,
        selectedDate: selection.selectedDate,
        historyId: selection.menuRecommendation?.id ?? null,
      },
    };
  }
}
