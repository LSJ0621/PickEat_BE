import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { runPipeline } from '@/common/pipeline/pipeline';
import { NaverSearchClient } from '@/external/naver/clients/naver-search.client';
import { LocationService } from '@/external/naver/services/location.service';
import { SearchRestaurantsDto } from '@/search/dto/search-restaurants.dto';
import {
  NaverLocalSearchItem,
  RestaurantSummary,
  SearchRestaurantsResponse,
} from '@/search/interfaces/search.interface';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly locationService: LocationService,
    private readonly naverSearchClient: NaverSearchClient,
  ) {}

  async searchRestaurants(
    dto: SearchRestaurantsDto,
  ): Promise<SearchRestaurantsResponse> {
    const menuName = dto.menuName?.trim();
    if (!menuName) {
      throw new BadRequestException('menuName must not be empty');
    }

    const context: {
      address?: string;
      query?: string;
      restaurants: RestaurantSummary[];
    } = { restaurants: [] };

    await runPipeline(
      [
        {
          name: 'reverseGeocode',
          run: async (ctx) => {
            ctx.address = await this.locationService.reverseGeocode(
              dto.latitude,
              dto.longitude,
              dto.includeRoadAddress ?? false,
            );
          },
        },
        {
          name: 'naverLocalSearch',
          run: async (ctx) => {
            ctx.query = `${menuName} ${ctx.address}`;

            this.logger.log(
              `🔍 [네이버 검색 요청] query="${ctx.query}", lat=${dto.latitude}, lng=${dto.longitude}`,
            );

            const items = await this.naverSearchClient.searchLocal(
              ctx.query,
            );

            if (!items.length) {
              throw new BadRequestException('검색 결과가 없습니다.');
            }

            ctx.restaurants = items.map((item) => this.mapNaverItem(item));

            this.logger.log(
              `✅ [네이버 검색 응답] query="${ctx.query}", count=${ctx.restaurants.length}`,
            );
          },
        },
      ],
      context,
      {
        onStepError: (name, error) => {
          const message = error instanceof Error ? error.message : 'unknown error';
          this.logger.error(
            `❌ [네이버 검색 단계 에러] step=${name}, message=${message}`,
            error instanceof Error ? error.stack : undefined,
          );
        },
      },
    );

    return { restaurants: context.restaurants };
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
