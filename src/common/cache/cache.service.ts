import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CACHE_TTL, CACHE_KEY } from './cache.constants';
import {
  CachedUserPreferences,
  CachedUserAddresses,
  CachedUserProfile,
  CachedWebSearchSummary,
} from './cache.interface';

export {
  CachedUserPreferences,
  CachedUserAddresses,
  CachedUserProfile,
  CachedWebSearchSummary,
} from './cache.interface';

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  // ==================== 사용자 선호도 캐싱 ====================

  /**
   * 사용자 선호도 조회
   */
  async getUserPreferences(
    userId: number,
  ): Promise<CachedUserPreferences | null> {
    const key = CACHE_KEY.userPreferences(userId);
    const cached = await this.cacheManager.get<CachedUserPreferences>(key);

    if (cached) {
      this.logger.debug(`Cache HIT: ${key}`);
    } else {
      this.logger.debug(`Cache MISS: ${key}`);
    }

    return cached || null;
  }

  /**
   * 사용자 선호도 저장
   */
  async setUserPreferences(
    userId: number,
    preferences: Omit<CachedUserPreferences, 'cachedAt'>,
  ): Promise<void> {
    const key = CACHE_KEY.userPreferences(userId);
    await this.cacheManager.set(
      key,
      {
        ...preferences,
        cachedAt: new Date().toISOString(),
      },
      CACHE_TTL.USER_PREFERENCES * 1000,
    );
    this.logger.debug(`Cache SET: ${key}`);
  }

  /**
   * 사용자 선호도 캐시 무효화
   */
  async invalidateUserPreferences(userId: number): Promise<void> {
    const key = CACHE_KEY.userPreferences(userId);
    await this.cacheManager.del(key);
    this.logger.debug(`Cache INVALIDATE: ${key}`);
  }

  // ==================== 사용자 주소 캐싱 ====================

  /**
   * 사용자 주소 목록 조회
   */
  async getUserAddresses(userId: number): Promise<CachedUserAddresses | null> {
    const key = CACHE_KEY.userAddresses(userId);
    const cached = await this.cacheManager.get<CachedUserAddresses>(key);

    if (cached) {
      this.logger.debug(`Cache HIT: ${key}`);
    } else {
      this.logger.debug(`Cache MISS: ${key}`);
    }

    return cached || null;
  }

  /**
   * 사용자 주소 목록 저장
   */
  async setUserAddresses(
    userId: number,
    addresses: CachedUserAddresses['addresses'],
  ): Promise<void> {
    const key = CACHE_KEY.userAddresses(userId);
    await this.cacheManager.set(
      key,
      {
        addresses,
        cachedAt: new Date().toISOString(),
      },
      CACHE_TTL.USER_ADDRESSES * 1000,
    );
    this.logger.debug(`Cache SET: ${key}`);
  }

  /**
   * 사용자 주소 캐시 무효화
   */
  async invalidateUserAddresses(userId: number): Promise<void> {
    const key = CACHE_KEY.userAddresses(userId);
    await this.cacheManager.del(key);
    this.logger.debug(`Cache INVALIDATE: ${key}`);
  }

  // ==================== 사용자 프로필 캐싱 ====================

  /**
   * 사용자 프로필 조회
   */
  async getUserProfile(userId: number): Promise<CachedUserProfile | null> {
    const key = CACHE_KEY.userProfile(userId);
    const cached = await this.cacheManager.get<CachedUserProfile>(key);

    if (cached) {
      this.logger.debug(`Cache HIT: ${key}`);
    } else {
      this.logger.debug(`Cache MISS: ${key}`);
    }

    return cached || null;
  }

  /**
   * 사용자 프로필 저장
   */
  async setUserProfile(
    userId: number,
    profile: Omit<CachedUserProfile, 'cachedAt'>,
  ): Promise<void> {
    const key = CACHE_KEY.userProfile(userId);
    await this.cacheManager.set(
      key,
      {
        ...profile,
        cachedAt: new Date().toISOString(),
      },
      CACHE_TTL.USER_PROFILE * 1000,
    );
    this.logger.debug(`Cache SET: ${key}`);
  }

  /**
   * 사용자 프로필 캐시 무효화
   */
  async invalidateUserProfile(userId: number): Promise<void> {
    const key = CACHE_KEY.userProfile(userId);
    await this.cacheManager.del(key);
    this.logger.debug(`Cache INVALIDATE: ${key}`);
  }

  // ==================== 웹서치 요약 캐싱 ====================

  /**
   * 주소에서 지역 추출 (예: "서울특별시 강남구 ..." → "서울")
   */
  private extractRegion(address?: string): string {
    if (!address) return 'unknown';

    // 한국 주소 패턴: 시/도 추출
    const koreaMatch = address.match(
      /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/,
    );
    if (koreaMatch) return koreaMatch[1];

    // 영문 주소 패턴: 첫 번째 단어
    const words = address.split(/[,\s]+/);
    if (words.length > 0) return words[0].toLowerCase();

    return 'unknown';
  }

  /**
   * 생년에서 연령대 계산
   */
  private getAgeGroup(birthYear?: number): string {
    if (!birthYear) return 'unknown';

    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear;

    if (age < 20) return 'teens';
    if (age < 30) return '20s';
    if (age < 40) return '30s';
    if (age < 50) return '40s';
    if (age < 60) return '50s';
    return '60plus';
  }

  /**
   * 현재 월 키 생성 (YYYY-MM 형식)
   */
  private getMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * 웹서치 요약 조회
   */
  async getWebSearchSummary(
    address?: string,
    birthYear?: number,
    gender?: string,
  ): Promise<CachedWebSearchSummary | null> {
    const region = this.extractRegion(address);
    const ageGroup = this.getAgeGroup(birthYear);
    const genderKey = gender || 'unknown';
    const month = this.getMonthKey();

    const key = CACHE_KEY.webSearchSummary(region, ageGroup, genderKey, month);
    const cached = await this.cacheManager.get<CachedWebSearchSummary>(key);

    if (cached) {
      this.logger.debug(`Cache HIT: ${key}`);
    } else {
      this.logger.debug(`Cache MISS: ${key}`);
    }

    return cached || null;
  }

  /**
   * 웹서치 요약 저장
   */
  async setWebSearchSummary(
    address: string | undefined,
    birthYear: number | undefined,
    gender: string | undefined,
    summary: Omit<CachedWebSearchSummary, 'cachedAt'>,
  ): Promise<void> {
    const region = this.extractRegion(address);
    const ageGroup = this.getAgeGroup(birthYear);
    const genderKey = gender || 'unknown';
    const month = this.getMonthKey();

    const key = CACHE_KEY.webSearchSummary(region, ageGroup, genderKey, month);
    await this.cacheManager.set(
      key,
      {
        ...summary,
        cachedAt: new Date().toISOString(),
      },
      CACHE_TTL.WEB_SEARCH_SUMMARY * 1000,
    );
    this.logger.debug(`Cache SET: ${key}`);
  }
}
