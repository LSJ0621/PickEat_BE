import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CACHE_TTL, CACHE_KEY } from './cache.constants';
import { CachedPlaceDetail, CachedBlogSearchResult } from './cache.interface';

export { CachedPlaceDetail, CachedBlogSearchResult } from './cache.interface';

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Google Place 상세정보 조회
   */
  async getPlaceDetail(placeId: string): Promise<CachedPlaceDetail | null> {
    const key = CACHE_KEY.place(placeId);
    const cached = await this.cacheManager.get<CachedPlaceDetail>(key);

    if (cached) {
      this.logger.debug(`Cache HIT: ${key}`);
    } else {
      this.logger.debug(`Cache MISS: ${key}`);
    }

    return cached || null;
  }

  /**
   * Google Place 상세정보 저장
   */
  async setPlaceDetail(
    placeId: string,
    detail: CachedPlaceDetail,
  ): Promise<void> {
    const key = CACHE_KEY.place(placeId);
    await this.cacheManager.set(
      key,
      {
        ...detail,
        cachedAt: new Date().toISOString(),
      },
      CACHE_TTL.PLACE_DETAIL * 1000,
    ); // cache-manager는 ms 단위
    this.logger.debug(`Cache SET: ${key}`);
  }

  /**
   * 여러 Place 상세정보 배치 조회 (N+1 문제 해결용)
   */
  async getPlaceDetailsBatch(
    placeIds: string[],
  ): Promise<Map<string, CachedPlaceDetail>> {
    const result = new Map<string, CachedPlaceDetail>();

    // 병렬로 캐시 조회
    const promises = placeIds.map(async (placeId) => {
      try {
        const cached = await this.getPlaceDetail(placeId);
        if (cached) {
          result.set(placeId, cached);
        }
      } catch (error) {
        this.logger.warn(`Failed to get cache for ${placeId}: ${error}`);
      }
    });

    await Promise.all(promises);

    this.logger.debug(`Batch cache: ${result.size}/${placeIds.length} hits`);
    return result;
  }

  /**
   * 여러 Place 상세정보 배치 저장
   */
  async setPlaceDetailsBatch(
    details: Map<string, CachedPlaceDetail>,
  ): Promise<void> {
    const promises = Array.from(details.entries()).map(([placeId, detail]) =>
      this.setPlaceDetail(placeId, detail),
    );
    await Promise.all(promises);
  }

  /**
   * 블로그 검색 결과 조회
   */
  async getBlogSearchResult(
    query: string,
    language: string,
  ): Promise<CachedBlogSearchResult | null> {
    const key = CACHE_KEY.blog(query, language);
    const cached = await this.cacheManager.get<CachedBlogSearchResult>(key);

    if (cached) {
      this.logger.debug(`Cache HIT: ${key}`);
    } else {
      this.logger.debug(`Cache MISS: ${key}`);
    }

    return cached || null;
  }

  /**
   * 블로그 검색 결과 저장
   */
  async setBlogSearchResult(
    query: string,
    language: string,
    result: CachedBlogSearchResult,
  ): Promise<void> {
    const key = CACHE_KEY.blog(query, language);
    await this.cacheManager.set(
      key,
      {
        ...result,
        cachedAt: new Date().toISOString(),
      },
      CACHE_TTL.BLOG_SEARCH * 1000,
    ); // cache-manager는 ms 단위
    this.logger.debug(`Cache SET: ${key}`);
  }
}
