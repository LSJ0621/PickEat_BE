import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { NaverSearchClient } from '../external/naver/clients/naver-search.client';
import { MapService } from '../map/map.service';
import { SearchRestaurantsDto } from './dto/search-restaurants.dto';
import {
  NaverLocalSearchItem,
  RestaurantSummary,
  SearchRestaurantsResponse,
} from './interfaces/search.interface';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(forwardRef(() => MapService))
    private readonly mapService: MapService,
    private readonly naverSearchClient: NaverSearchClient,
  ) {}

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
      const items = await this.naverSearchClient.searchLocal(query);

      const restaurants = items.map((item) => this.mapNaverItem(item));

      this.logger.log(
        `✅ [네이버 검색 응답] query="${query}", count=${restaurants.length}`,
      );

      return { restaurants };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `❌ [네이버 검색 에러] query="${query}", error=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
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

    let decoded = value.replace(/<[^>]*>/g, '');

    decoded = decoded
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (match, dec) =>
        String.fromCharCode(parseInt(dec, 10)),
      )
      .replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );

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
    return Number((parsed / 1000).toFixed(2));
  }
}
