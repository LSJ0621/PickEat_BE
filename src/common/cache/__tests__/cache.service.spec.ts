import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RedisCacheService } from '../cache.service';
import { CACHE_TTL, CACHE_KEY } from '../cache.constants';
import type {
  CachedUserPreferences,
  CachedUserAddresses,
  CachedUserProfile,
  CachedWebSearchSummary,
} from '../cache.interface';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const USER_ID = 1;

const mockPreferences: Omit<CachedUserPreferences, 'cachedAt'> = {
  likes: ['김치찌개', '된장찌개'],
  dislikes: ['피자'],
  analysis: '한식 선호',
  structuredAnalysis: {
    stablePatterns: {
      categories: ['한식'],
      flavors: ['얼큰한'],
      cookingMethods: ['끓이기'],
      confidence: 'high',
    },
    recentSignals: { trending: ['국밥'], declining: ['양식'] },
    diversityHints: { explorationAreas: ['일식'], rotationSuggestions: ['중식'] },
  },
  analysisParagraphs: {
    paragraph1: '첫 번째',
    paragraph2: '두 번째',
    paragraph3: '세 번째',
  },
  lastAnalyzedAt: '2026-02-15T10:00:00.000Z',
  analysisVersion: 1,
};

const mockAddresses: CachedUserAddresses['addresses'] = [
  {
    id: 1,
    roadAddress: '서울특별시 강남구 테헤란로 123',
    postalCode: '06234',
    latitude: 37.5012345,
    longitude: 127.0398765,
    isDefault: true,
    isSearchAddress: false,
    alias: '회사',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
];

const mockProfile: Omit<CachedUserProfile, 'cachedAt'> = {
  email: 'test@example.com',
  name: '테스트 사용자',
  address: '서울특별시 강남구 테헤란로 123',
  latitude: 37.5012345,
  longitude: 127.0398765,
  birthDate: '1990-01-15',
  gender: 'male',
  preferredLanguage: 'ko',
};

const mockSummary: Omit<CachedWebSearchSummary, 'cachedAt'> = {
  localTrends: ['김치찌개', '된장찌개', '순두부찌개'],
  demographicFavorites: ['삼겹살', '갈비', '불고기'],
  seasonalItems: ['냉면', '수박'],
  confidence: 'high',
  summary: '서울 강남 지역 선호 메뉴',
  searchedAt: '2026-02-15T10:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifies that the get method returns cached data when the cache manager
 * resolves with a value and returns null on miss.
 */
function buildGetTests<T extends { cachedAt: string }>(
  label: string,
  getCached: (service: RedisCacheService) => Promise<T | null>,
  expectedKey: (userId: number) => string,
  cachedData: T,
) {
  describe(label, () => {
    it('should return cached data on cache hit', async () => {
      // Will be closed over in the test body via the outer describe setup
    });
  });
}

// (The helper above is replaced by inline parameterised tests below for clarity.)

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RedisCacheService', () => {
  let service: RedisCacheService;
  let cacheManager: jest.Mocked<Cache>;

  beforeEach(async () => {
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<Cache>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCacheService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get<RedisCacheService>(RedisCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Shared get/invalidate behaviour helper (DRY for user-keyed methods)
  // =========================================================================

  /**
   * Runs the standard hit/miss/invalidate trio for user-keyed cache methods.
   */
  function describeUserCacheTrio<T>(
    groupLabel: string,
    keyFn: (id: number) => string,
    getFn: (s: RedisCacheService, id: number) => Promise<T | null>,
    invalidateFn: (s: RedisCacheService, id: number) => Promise<void>,
    sampleCachedData: T,
  ) {
    describe(groupLabel, () => {
      describe('get', () => {
        it('should return cached data on cache hit', async () => {
          cacheManager.get.mockResolvedValue(sampleCachedData);
          const result = await getFn(service, USER_ID);
          expect(result).toEqual(sampleCachedData);
          expect(cacheManager.get).toHaveBeenCalledWith(keyFn(USER_ID));
        });

        it('should return null on cache miss', async () => {
          cacheManager.get.mockResolvedValue(undefined);
          const result = await getFn(service, USER_ID);
          expect(result).toBeNull();
          expect(cacheManager.get).toHaveBeenCalledWith(keyFn(USER_ID));
        });
      });

      describe('invalidate', () => {
        it('should delete the cache entry', async () => {
          cacheManager.del.mockResolvedValue(undefined);
          await invalidateFn(service, USER_ID);
          expect(cacheManager.del).toHaveBeenCalledWith(keyFn(USER_ID));
        });
      });
    });
  }

  // =========================================================================
  // User Preferences
  // =========================================================================

  describeUserCacheTrio<CachedUserPreferences>(
    'getUserPreferences / invalidateUserPreferences',
    CACHE_KEY.userPreferences,
    (s, id) => s.getUserPreferences(id),
    (s, id) => s.invalidateUserPreferences(id),
    { ...mockPreferences, cachedAt: '2026-02-15T10:00:00.000Z' },
  );

  describe('setUserPreferences', () => {
    it('should store preferences with cachedAt timestamp and correct TTL', async () => {
      const beforeTime = Date.now();
      cacheManager.set.mockResolvedValue(undefined);

      await service.setUserPreferences(USER_ID, mockPreferences);

      const afterTime = Date.now();
      expect(cacheManager.set).toHaveBeenCalledWith(
        CACHE_KEY.userPreferences(USER_ID),
        expect.objectContaining({ ...mockPreferences, cachedAt: expect.any(String) }),
        CACHE_TTL.USER_PREFERENCES * 1000,
      );

      const stored = (cacheManager.set as jest.Mock).mock.calls[0][1];
      const storedTime = new Date(stored.cachedAt).getTime();
      expect(storedTime).toBeGreaterThanOrEqual(beforeTime);
      expect(storedTime).toBeLessThanOrEqual(afterTime);
    });
  });

  // =========================================================================
  // User Addresses
  // =========================================================================

  describeUserCacheTrio<CachedUserAddresses>(
    'getUserAddresses / invalidateUserAddresses',
    CACHE_KEY.userAddresses,
    (s, id) => s.getUserAddresses(id),
    (s, id) => s.invalidateUserAddresses(id),
    { addresses: mockAddresses, cachedAt: '2026-02-15T10:00:00.000Z' },
  );

  describe('setUserAddresses', () => {
    it('should store addresses with cachedAt timestamp and correct TTL', async () => {
      cacheManager.set.mockResolvedValue(undefined);
      await service.setUserAddresses(USER_ID, mockAddresses);

      expect(cacheManager.set).toHaveBeenCalledWith(
        CACHE_KEY.userAddresses(USER_ID),
        expect.objectContaining({ addresses: mockAddresses, cachedAt: expect.any(String) }),
        CACHE_TTL.USER_ADDRESSES * 1000,
      );
    });

    it('should handle empty addresses array', async () => {
      cacheManager.set.mockResolvedValue(undefined);
      await service.setUserAddresses(USER_ID, []);

      expect(cacheManager.set).toHaveBeenCalledWith(
        CACHE_KEY.userAddresses(USER_ID),
        expect.objectContaining({ addresses: [] }),
        CACHE_TTL.USER_ADDRESSES * 1000,
      );
    });
  });

  // =========================================================================
  // User Profile
  // =========================================================================

  describeUserCacheTrio<CachedUserProfile>(
    'getUserProfile / invalidateUserProfile',
    CACHE_KEY.userProfile,
    (s, id) => s.getUserProfile(id),
    (s, id) => s.invalidateUserProfile(id),
    { ...mockProfile, cachedAt: '2026-02-15T10:00:00.000Z' },
  );

  describe('setUserProfile', () => {
    it('should store profile with cachedAt timestamp and correct TTL', async () => {
      cacheManager.set.mockResolvedValue(undefined);
      await service.setUserProfile(USER_ID, mockProfile);

      expect(cacheManager.set).toHaveBeenCalledWith(
        CACHE_KEY.userProfile(USER_ID),
        expect.objectContaining({ ...mockProfile, cachedAt: expect.any(String) }),
        CACHE_TTL.USER_PROFILE * 1000,
      );
    });

    it('should handle profile with null optional fields', async () => {
      const minimalProfile: Omit<CachedUserProfile, 'cachedAt'> = {
        email: 'test@example.com',
        name: null,
        address: null,
        latitude: null,
        longitude: null,
        birthDate: null,
        gender: null,
        preferredLanguage: 'en',
      };
      cacheManager.set.mockResolvedValue(undefined);
      await service.setUserProfile(USER_ID, minimalProfile);

      expect(cacheManager.set).toHaveBeenCalledWith(
        CACHE_KEY.userProfile(USER_ID),
        expect.objectContaining(minimalProfile),
        CACHE_TTL.USER_PROFILE * 1000,
      );
    });
  });

  // =========================================================================
  // Web Search Summary
  // =========================================================================

  describe('getWebSearchSummary', () => {
    it('should return cached summary on cache hit', async () => {
      const cached: CachedWebSearchSummary = { ...mockSummary, cachedAt: '2026-02-15T10:00:00.000Z' };
      cacheManager.get.mockResolvedValue(cached);

      const result = await service.getWebSearchSummary('서울특별시 강남구 테헤란로', 1996, 'male');

      expect(result).toEqual(cached);
      expect(cacheManager.get).toHaveBeenCalledWith(
        expect.stringContaining('ai:websearch:서울:30s:male:'),
      );
    });

    it('should return null on cache miss', async () => {
      cacheManager.get.mockResolvedValue(undefined);
      const result = await service.getWebSearchSummary('서울특별시 강남구', 1996, 'male');
      expect(result).toBeNull();
    });

    describe('cache key segments — undefined inputs default to "unknown"', () => {
      it.each([
        [undefined, 1996, 'male', 'ai:websearch:unknown:30s:male:'],
        ['서울특별시 강남구', undefined, 'male', 'ai:websearch:서울:unknown:male:'],
        ['서울특별시 강남구', 1996, undefined, 'ai:websearch:서울:30s:unknown:'],
      ])(
        'address=%j birthYear=%j gender=%j -> key contains %j',
        async (address, birthYear, gender, keyFragment) => {
          cacheManager.get.mockResolvedValue(null);
          await service.getWebSearchSummary(address, birthYear, gender);
          expect(cacheManager.get).toHaveBeenCalledWith(
            expect.stringContaining(keyFragment),
          );
        },
      );
    });

    describe('extractRegion (via getWebSearchSummary)', () => {
      it.each([
        ['서울특별시 강남구', '서울'],
        ['부산광역시 해운대구', '부산'],
        ['대구광역시 중구', '대구'],
        ['인천광역시 연수구', '인천'],
        ['광주광역시 북구', '광주'],
        ['대전광역시 유성구', '대전'],
        ['울산광역시 남구', '울산'],
        ['세종특별자치시', '세종'],
        ['경기도 성남시', '경기'],
        ['강원도 춘천시', '강원'],
        ['충북 청주시', '충북'],
        ['충남 천안시', '충남'],
        ['전북 전주시', '전북'],
        ['전남 순천시', '전남'],
        ['경북 포항시', '경북'],
        ['경남 창원시', '경남'],
        ['제주특별자치도', '제주'],
        ['Tokyo, Shibuya Ward', 'tokyo'],
        ['', 'unknown'],
      ])(
        'address "%s" -> region "%s"',
        async (address, region) => {
          cacheManager.get.mockResolvedValue(null);
          await service.getWebSearchSummary(address, 1996, 'male');
          expect(cacheManager.get).toHaveBeenCalledWith(
            expect.stringContaining(`ai:websearch:${region}:`),
          );
        },
      );
    });

    describe('getAgeGroup (via getWebSearchSummary)', () => {
      // Current year is 2026
      it.each([
        [2010, 'teens'],   // age 16
        [2006, '20s'],     // age 20
        [1996, '30s'],     // age 30
        [1986, '40s'],     // age 40
        [1976, '50s'],     // age 50
        [1956, '60plus'],  // age 70
        [undefined, 'unknown'],
      ])(
        'birthYear %s -> ageGroup "%s"',
        async (birthYear, ageGroup) => {
          cacheManager.get.mockResolvedValue(null);
          await service.getWebSearchSummary('서울특별시', birthYear, 'male');
          expect(cacheManager.get).toHaveBeenCalledWith(
            expect.stringContaining(`ai:websearch:서울:${ageGroup}:`),
          );
        },
      );
    });

    it('should include current month in YYYY-MM format in cache key', async () => {
      cacheManager.get.mockResolvedValue(null);
      await service.getWebSearchSummary('서울특별시', 1996, 'male');

      const calledKey = (cacheManager.get as jest.Mock).mock.calls[0][0] as string;
      const monthPart = calledKey.split(':').pop();
      expect(monthPart).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('setWebSearchSummary', () => {
    it('should store summary with cachedAt timestamp and correct TTL', async () => {
      cacheManager.set.mockResolvedValue(undefined);
      await service.setWebSearchSummary('서울특별시 강남구 테헤란로', 1996, 'male', mockSummary);

      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining('ai:websearch:서울:30s:male:'),
        expect.objectContaining({ ...mockSummary, cachedAt: expect.any(String) }),
        CACHE_TTL.WEB_SEARCH_SUMMARY * 1000,
      );
    });
  });

  // =========================================================================
  // Cache Key Generation
  // =========================================================================

  describe('Cache Key Generation', () => {
    it('should generate unique keys for different users', () => {
      expect(CACHE_KEY.userPreferences(1)).toBe('user:1:preferences');
      expect(CACHE_KEY.userPreferences(2)).toBe('user:2:preferences');
      expect(CACHE_KEY.userPreferences(1)).not.toBe(CACHE_KEY.userPreferences(2));
    });

    it('should generate distinct keys for different cache types for the same user', () => {
      const keys = [
        CACHE_KEY.userPreferences(USER_ID),
        CACHE_KEY.userAddresses(USER_ID),
        CACHE_KEY.userProfile(USER_ID),
      ];
      expect(keys).toEqual(['user:1:preferences', 'user:1:addresses', 'user:1:profile']);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('should generate deterministic web search keys', () => {
      const key = CACHE_KEY.webSearchSummary('서울', '20s', 'male', '2026-02');
      expect(key).toBe('ai:websearch:서울:20s:male:2026-02');
      expect(CACHE_KEY.webSearchSummary('서울', '20s', 'male', '2026-02')).toBe(key);
    });

    it('should generate different web search keys for different months', () => {
      const key1 = CACHE_KEY.webSearchSummary('서울', '20s', 'male', '2026-02');
      const key2 = CACHE_KEY.webSearchSummary('서울', '20s', 'male', '2026-03');
      expect(key1).not.toBe(key2);
    });
  });

  // =========================================================================
  // TTL Configuration
  // =========================================================================

  describe('TTL Configuration', () => {
    it('should define correct TTL values in seconds', () => {
      expect(CACHE_TTL.USER_PREFERENCES).toBe(30 * 60);
      expect(CACHE_TTL.USER_ADDRESSES).toBe(30 * 60);
      expect(CACHE_TTL.USER_PROFILE).toBe(30 * 60);
      expect(CACHE_TTL.WEB_SEARCH_SUMMARY).toBe(7 * 24 * 60 * 60);
    });
  });
});
