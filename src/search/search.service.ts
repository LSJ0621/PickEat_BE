import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { lastValueFrom } from 'rxjs';
import { MapService } from '../map/map.service';
import { SearchRestaurantsDto } from './dto/search-restaurants.dto';

const NAVER_LOCAL_SEARCH_URL = 'https://openapi.naver.com/v1/search/local.json';

interface NaverLocalSearchItem {
  title: string;
  category?: string;
  description?: string;
  telephone?: string;
  address?: string;
  roadAddress?: string;
  link?: string;
  mapx?: string;
  mapy?: string;
  distance?: string;
}

interface NaverLocalSearchResponse {
  total: number;
  display: number;
  start: number;
  items: NaverLocalSearchItem[];
}

export interface RestaurantSummary {
  name: string;
  address: string;
  roadAddress?: string;
  phone?: string;
  mapx?: number;
  mapy?: number;
  distance?: number;
  link?: string;
}

export interface SearchRestaurantsResponse {
  restaurants: RestaurantSummary[];
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly naverClientId: string;
  private readonly naverClientSecret: string;

  constructor(
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => MapService))
    private readonly mapService: MapService,
    private readonly config: ConfigService,
  ) {
    // .env.development 기준:
    // NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
    this.naverClientId = this.config.get<string>('NAVER_CLIENT_ID', '');
    this.naverClientSecret = this.config.get<string>('NAVER_CLIENT_SECRET', '');
  }

  async searchRestaurants(
    dto: SearchRestaurantsDto,
  ): Promise<SearchRestaurantsResponse> {
    const menuName = dto.menuName?.trim();
    if (!menuName) {
      throw new BadRequestException('menuName must not be empty');
    }

    const address = await this.mapService.reverseGeocode(
      dto.latitude,
      dto.longitude,
      dto.includeRoadAddress ?? false,
    );
    const query = address ? `${menuName} ${address}` : menuName;

    this.logger.log(
      `🔍 [네이버 검색 요청] query="${query}", lat=${dto.latitude}, lng=${dto.longitude}`,
    );

    try {
      const headers = {
        'X-Naver-Client-Id': this.naverClientId,
        'X-Naver-Client-Secret': this.naverClientSecret,
      };
      const params = {
        query,
        display: 5,
      };
      const response = await lastValueFrom(
        this.httpService.get<NaverLocalSearchResponse>(NAVER_LOCAL_SEARCH_URL, {
          headers,
          params,
        }),
      );

      const restaurants = (response.data.items ?? []).map((item) =>
        this.mapNaverItem(item),
      );

      this.logger.log(
        `✅ [네이버 검색 응답] query="${query}", count=${restaurants.length}`,
      );

      return { restaurants };
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const data = axiosError.response?.data;
      this.logger.error(
        `❌ [네이버 검색 에러] query="${query}", status=${status ?? 'unknown'}`,
        axiosError.stack,
      );
      if (data) {
        this.logger.error(
          `❌ [네이버 검색 에러 상세] ${JSON.stringify(data).slice(0, 500)}`,
        );
      }
      throw new InternalServerErrorException(
        'Failed to fetch local restaurants from Naver',
      );
    }
  }

  private mapNaverItem(item: NaverLocalSearchItem): RestaurantSummary {
    const mapx = this.parseCoordinate(item.mapx);
    const mapy = this.parseCoordinate(item.mapy);
    const distance = this.parseDistance(item.distance);

    return {
      name: this.stripHtmlTags(item.title),
      address: this.stripHtmlTags(item.address) || '',
      roadAddress: this.stripHtmlTags(item.roadAddress) || undefined,
      phone: item.telephone || undefined,
      mapx,
      mapy,
      distance,
      link: item.link || undefined,
    };
  }

  private stripHtmlTags(value?: string) {
    if (!value) {
      return '';
    }

    // HTML 태그 제거
    let decoded = value.replace(/<[^>]*>/g, '');

    // HTML 엔티티 디코딩
    decoded = decoded
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // 숫자 엔티티 디코딩 (&#123; 형식)
      .replace(/&#(\d+);/g, (match, dec) =>
        String.fromCharCode(parseInt(dec, 10)),
      )
      // 16진수 엔티티 디코딩 (&#x1F; 형식)
      .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );

    // 디코딩 후 다시 한 번 태그 제거 (XSS 방지 안전장치)
    decoded = decoded.replace(/<[^>]*>/g, '');

    return decoded.trim();
  }

  private parseCoordinate(value?: string) {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parseDistance(value?: string) {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    // Naver distance is returned in meters, convert to kilometers.
    return Number((parsed / 1000).toFixed(2));
  }
}
