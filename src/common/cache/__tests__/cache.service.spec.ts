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
        {
          provide: CACHE_MANAGER,
          useValue: cacheManager,
        },
      ],
    }).compile();

    service = module.get<RedisCacheService>(RedisCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('User Preferences', () => {
    const userId = 1;
    const mockPreferences: Omit<CachedUserPreferences, 'cachedAt'> = {
      likes: ['김치찌개', '된장찌개', '순두부찌개'],
      dislikes: ['피자', '햄버거'],
      analysis: '한식을 선호하는 경향',
      structuredAnalysis: {
        stablePatterns: {
          categories: ['한식', '찌개'],
          flavors: ['얼큰한', '구수한'],
          cookingMethods: ['끓이기', '조리기'],
          confidence: 'high',
        },
        recentSignals: {
          trending: ['국밥'],
          declining: ['양식'],
        },
        diversityHints: {
          explorationAreas: ['일식'],
          rotationSuggestions: ['중식'],
        },
      },
      analysisParagraphs: {
        paragraph1: '첫 번째 분석',
        paragraph2: '두 번째 분석',
        paragraph3: '세 번째 분석',
      },
      lastAnalyzedAt: '2026-02-15T10:00:00.000Z',
      analysisVersion: 1,
    };

    describe('getUserPreferences', () => {
      it('should return cached preferences when cache hit', async () => {
        // Arrange
        const cachedData: CachedUserPreferences = {
          ...mockPreferences,
          cachedAt: '2026-02-15T10:00:00.000Z',
        };
        cacheManager.get.mockResolvedValue(cachedData);

        // Act
        const result = await service.getUserPreferences(userId);

        // Assert
        expect(result).toEqual(cachedData);
        expect(cacheManager.get).toHaveBeenCalledWith(
          CACHE_KEY.userPreferences(userId),
        );
      });

      it('should return null when cache miss', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(undefined);

        // Act
        const result = await service.getUserPreferences(userId);

        // Assert
        expect(result).toBeNull();
        expect(cacheManager.get).toHaveBeenCalledWith(
          CACHE_KEY.userPreferences(userId),
        );
      });
    });

    describe('setUserPreferences', () => {
      it('should set user preferences with cachedAt timestamp', async () => {
        // Arrange
        const beforeTime = Date.now();
        cacheManager.set.mockResolvedValue(undefined);

        // Act
        await service.setUserPreferences(userId, mockPreferences);
        const afterTime = Date.now();

        // Assert
        expect(cacheManager.set).toHaveBeenCalledWith(
          CACHE_KEY.userPreferences(userId),
          expect.objectContaining({
            ...mockPreferences,
            cachedAt: expect.any(String),
          }),
          CACHE_TTL.USER_PREFERENCES * 1000,
        );

        const cachedData = (cacheManager.set as jest.Mock).mock.calls[0][1];
        const cachedTime = new Date(cachedData.cachedAt).getTime();
        expect(cachedTime).toBeGreaterThanOrEqual(beforeTime);
        expect(cachedTime).toBeLessThanOrEqual(afterTime);
      });

      it('should use correct TTL for user preferences', async () => {
        // Arrange
        cacheManager.set.mockResolvedValue(undefined);

        // Act
        await service.setUserPreferences(userId, mockPreferences);

        // Assert
        expect(cacheManager.set).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Object),
          CACHE_TTL.USER_PREFERENCES * 1000,
        );
      });
    });

    describe('invalidateUserPreferences', () => {
      it('should delete user preferences from cache', async () => {
        // Arrange
        cacheManager.del.mockResolvedValue(undefined);

        // Act
        await service.invalidateUserPreferences(userId);

        // Assert
        expect(cacheManager.del).toHaveBeenCalledWith(
          CACHE_KEY.userPreferences(userId),
        );
      });
    });
  });

  describe('User Addresses', () => {
    const userId = 1;
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
      {
        id: 2,
        roadAddress: '서울특별시 서초구 서초대로 456',
        postalCode: '06590',
        latitude: 37.4923456,
        longitude: 127.0265432,
        isDefault: false,
        isSearchAddress: true,
        alias: '집',
        createdAt: '2026-02-02T00:00:00.000Z',
        updatedAt: '2026-02-02T00:00:00.000Z',
      },
    ];

    describe('getUserAddresses', () => {
      it('should return cached addresses when cache hit', async () => {
        // Arrange
        const cachedData: CachedUserAddresses = {
          addresses: mockAddresses,
          cachedAt: '2026-02-15T10:00:00.000Z',
        };
        cacheManager.get.mockResolvedValue(cachedData);

        // Act
        const result = await service.getUserAddresses(userId);

        // Assert
        expect(result).toEqual(cachedData);
        expect(cacheManager.get).toHaveBeenCalledWith(
          CACHE_KEY.userAddresses(userId),
        );
      });

      it('should return null when cache miss', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(undefined);

        // Act
        const result = await service.getUserAddresses(userId);

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('setUserAddresses', () => {
      it('should set user addresses with cachedAt timestamp', async () => {
        // Arrange
        cacheManager.set.mockResolvedValue(undefined);

        // Act
        await service.setUserAddresses(userId, mockAddresses);

        // Assert
        expect(cacheManager.set).toHaveBeenCalledWith(
          CACHE_KEY.userAddresses(userId),
          expect.objectContaining({
            addresses: mockAddresses,
            cachedAt: expect.any(String),
          }),
          CACHE_TTL.USER_ADDRESSES * 1000,
        );
      });

      it('should handle empty addresses array', async () => {
        // Arrange
        cacheManager.set.mockResolvedValue(undefined);

        // Act
        await service.setUserAddresses(userId, []);

        // Assert
        expect(cacheManager.set).toHaveBeenCalledWith(
          CACHE_KEY.userAddresses(userId),
          expect.objectContaining({
            addresses: [],
          }),
          CACHE_TTL.USER_ADDRESSES * 1000,
        );
      });
    });

    describe('invalidateUserAddresses', () => {
      it('should delete user addresses from cache', async () => {
        // Arrange
        cacheManager.del.mockResolvedValue(undefined);

        // Act
        await service.invalidateUserAddresses(userId);

        // Assert
        expect(cacheManager.del).toHaveBeenCalledWith(
          CACHE_KEY.userAddresses(userId),
        );
      });
    });
  });

  describe('User Profile', () => {
    const userId = 1;
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

    describe('getUserProfile', () => {
      it('should return cached profile when cache hit', async () => {
        // Arrange
        const cachedData: CachedUserProfile = {
          ...mockProfile,
          cachedAt: '2026-02-15T10:00:00.000Z',
        };
        cacheManager.get.mockResolvedValue(cachedData);

        // Act
        const result = await service.getUserProfile(userId);

        // Assert
        expect(result).toEqual(cachedData);
        expect(cacheManager.get).toHaveBeenCalledWith(
          CACHE_KEY.userProfile(userId),
        );
      });

      it('should return null when cache miss', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(undefined);

        // Act
        const result = await service.getUserProfile(userId);

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('setUserProfile', () => {
      it('should set user profile with cachedAt timestamp', async () => {
        // Arrange
        cacheManager.set.mockResolvedValue(undefined);

        // Act
        await service.setUserProfile(userId, mockProfile);

        // Assert
        expect(cacheManager.set).toHaveBeenCalledWith(
          CACHE_KEY.userProfile(userId),
          expect.objectContaining({
            ...mockProfile,
            cachedAt: expect.any(String),
          }),
          CACHE_TTL.USER_PROFILE * 1000,
        );
      });

      it('should handle profile with null optional fields', async () => {
        // Arrange
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

        // Act
        await service.setUserProfile(userId, minimalProfile);

        // Assert
        expect(cacheManager.set).toHaveBeenCalledWith(
          CACHE_KEY.userProfile(userId),
          expect.objectContaining(minimalProfile),
          CACHE_TTL.USER_PROFILE * 1000,
        );
      });
    });

    describe('invalidateUserProfile', () => {
      it('should delete user profile from cache', async () => {
        // Arrange
        cacheManager.del.mockResolvedValue(undefined);

        // Act
        await service.invalidateUserProfile(userId);

        // Assert
        expect(cacheManager.del).toHaveBeenCalledWith(
          CACHE_KEY.userProfile(userId),
        );
      });
    });
  });

  describe('Web Search Summary', () => {
    const mockSummary: Omit<CachedWebSearchSummary, 'cachedAt'> = {
      localTrends: ['김치찌개', '된장찌개', '순두부찌개'],
      demographicFavorites: ['삼겹살', '갈비', '불고기'],
      seasonalItems: ['냉면', '수박'],
      confidence: 'high',
      summary: '서울 강남 지역 20대 남성이 선호하는 메뉴입니다.',
      searchedAt: '2026-02-15T10:00:00.000Z',
    };

    describe('getWebSearchSummary', () => {
      it('should return cached summary when cache hit', async () => {
        // Arrange
        const address = '서울특별시 강남구 테헤란로 123';
        const birthYear = 1996; // 30세, 30s
        const gender = 'male';
        const cachedData: CachedWebSearchSummary = {
          ...mockSummary,
          cachedAt: '2026-02-15T10:00:00.000Z',
        };
        cacheManager.get.mockResolvedValue(cachedData);

        // Act
        const result = await service.getWebSearchSummary(
          address,
          birthYear,
          gender,
        );

        // Assert
        expect(result).toEqual(cachedData);
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:30s:male:'),
        );
      });

      it('should return null when cache miss', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(undefined);

        // Act
        const result = await service.getWebSearchSummary(
          '서울특별시 강남구',
          1996,
          'male',
        );

        // Assert
        expect(result).toBeNull();
      });

      it('should handle undefined address with unknown region', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary(undefined, 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:unknown:30s:male:'),
        );
      });

      it('should handle undefined birthYear with unknown age group', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary(
          '서울특별시 강남구',
          undefined,
          'male',
        );

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:unknown:male:'),
        );
      });

      it('should handle undefined gender with unknown gender key', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시 강남구', 1996, undefined);

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:30s:unknown:'),
        );
      });

      it('should include current month in cache key', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시 강남구', 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringMatching(/ai:websearch:서울:30s:male:\d{4}-\d{2}$/),
        );
      });
    });

    describe('setWebSearchSummary', () => {
      it('should set web search summary with cachedAt timestamp', async () => {
        // Arrange
        const address = '서울특별시 강남구 테헤란로 123';
        const birthYear = 1996;
        const gender = 'male';
        cacheManager.set.mockResolvedValue(undefined);

        // Act
        await service.setWebSearchSummary(
          address,
          birthYear,
          gender,
          mockSummary,
        );

        // Assert
        expect(cacheManager.set).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:30s:male:'),
          expect.objectContaining({
            ...mockSummary,
            cachedAt: expect.any(String),
          }),
          CACHE_TTL.WEB_SEARCH_SUMMARY * 1000,
        );
      });

      it('should use correct TTL for web search summary (7 days)', async () => {
        // Arrange
        cacheManager.set.mockResolvedValue(undefined);

        // Act
        await service.setWebSearchSummary(
          '서울특별시',
          1996,
          'male',
          mockSummary,
        );

        // Assert
        expect(cacheManager.set).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Object),
          7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        );
      });
    });

    describe('extractRegion (private method - tested via public methods)', () => {
      it('should extract Seoul from Korean address', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시 강남구', 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:'),
        );
      });

      it('should extract Busan from Korean address', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('부산광역시 해운대구', 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:부산:'),
        );
      });

      it('should extract Gyeonggi from Korean address', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('경기도 성남시', 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:경기:'),
        );
      });

      it('should extract first word from English address', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('Tokyo, Shibuya Ward', 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:tokyo:'),
        );
      });

      it('should handle empty address as unknown', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('', 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:unknown:'),
        );
      });

      it('should extract all major Korean cities', async () => {
        // Test all major cities
        const cities = [
          '서울',
          '부산',
          '대구',
          '인천',
          '광주',
          '대전',
          '울산',
          '세종',
          '경기',
          '강원',
          '충북',
          '충남',
          '전북',
          '전남',
          '경북',
          '경남',
          '제주',
        ];

        for (const city of cities) {
          jest.clearAllMocks();
          cacheManager.get.mockResolvedValue(null);

          await service.getWebSearchSummary(`${city}특별시`, 1996, 'male');

          expect(cacheManager.get).toHaveBeenCalledWith(
            expect.stringContaining(`ai:websearch:${city}:`),
          );
        }
      });
    });

    describe('getAgeGroup (private method - tested via public methods)', () => {
      it('should calculate 20s for birth year 2006 (age 20)', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act - Current year is 2026, 2006 = 20 years old = 20s
        await service.getWebSearchSummary('서울특별시', 2006, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:20s:'),
        );
      });

      it('should calculate 30s for birth year 1996 (age 30)', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시', 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:30s:'),
        );
      });

      it('should calculate 40s for birth year 1986 (age 40)', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시', 1986, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:40s:'),
        );
      });

      it('should calculate 50s for birth year 1976 (age 50)', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시', 1976, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:50s:'),
        );
      });

      it('should calculate 60plus for birth year 1956 (age 70)', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시', 1956, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:60plus:'),
        );
      });

      it('should calculate teens for birth year 2010 (age 16)', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시', 2010, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:teens:'),
        );
      });

      it('should handle undefined birthYear as unknown', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시', undefined, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringContaining('ai:websearch:서울:unknown:'),
        );
      });
    });

    describe('getMonthKey (private method - tested via public methods)', () => {
      it('should generate month key in YYYY-MM format', async () => {
        // Arrange
        cacheManager.get.mockResolvedValue(null);

        // Act
        await service.getWebSearchSummary('서울특별시', 1996, 'male');

        // Assert
        expect(cacheManager.get).toHaveBeenCalledWith(
          expect.stringMatching(/ai:websearch:서울:30s:male:2026-\d{2}$/),
        );
      });

      it('should pad single digit months with zero', async () => {
        // This test assumes current date is in February (02)
        // The getMonthKey should return '2026-02'
        cacheManager.get.mockResolvedValue(null);

        await service.getWebSearchSummary('서울특별시', 1996, 'male');

        const calledKey = (cacheManager.get as jest.Mock).mock.calls[0][0];
        const monthPart = calledKey.split(':').pop();

        // Month should be in format YYYY-MM (with zero padding)
        expect(monthPart).toMatch(/^\d{4}-\d{2}$/);
      });
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate unique keys for different users', () => {
      const key1 = CACHE_KEY.userPreferences(1);
      const key2 = CACHE_KEY.userPreferences(2);

      expect(key1).toBe('user:1:preferences');
      expect(key2).toBe('user:2:preferences');
      expect(key1).not.toBe(key2);
    });

    it('should generate unique keys for different cache types', () => {
      const userId = 1;
      const preferencesKey = CACHE_KEY.userPreferences(userId);
      const addressesKey = CACHE_KEY.userAddresses(userId);
      const profileKey = CACHE_KEY.userProfile(userId);

      expect(preferencesKey).toBe('user:1:preferences');
      expect(addressesKey).toBe('user:1:addresses');
      expect(profileKey).toBe('user:1:profile');

      const allKeys = [preferencesKey, addressesKey, profileKey];
      const uniqueKeys = new Set(allKeys);
      expect(uniqueKeys.size).toBe(allKeys.length);
    });

    it('should generate consistent web search keys for same parameters', () => {
      const key1 = CACHE_KEY.webSearchSummary('서울', '20s', 'male', '2026-02');
      const key2 = CACHE_KEY.webSearchSummary('서울', '20s', 'male', '2026-02');

      expect(key1).toBe(key2);
      expect(key1).toBe('ai:websearch:서울:20s:male:2026-02');
    });

    it('should generate different web search keys for different months', () => {
      const key1 = CACHE_KEY.webSearchSummary('서울', '20s', 'male', '2026-02');
      const key2 = CACHE_KEY.webSearchSummary('서울', '20s', 'male', '2026-03');

      expect(key1).not.toBe(key2);
    });
  });

  describe('TTL Configuration', () => {
    it('should have correct TTL values in seconds', () => {
      expect(CACHE_TTL.USER_PREFERENCES).toBe(30 * 60); // 30 minutes
      expect(CACHE_TTL.USER_ADDRESSES).toBe(30 * 60); // 30 minutes
      expect(CACHE_TTL.USER_PROFILE).toBe(30 * 60); // 30 minutes
      expect(CACHE_TTL.WEB_SEARCH_SUMMARY).toBe(7 * 24 * 60 * 60); // 7 days
    });

    it('should convert TTL to milliseconds when setting cache', async () => {
      // Arrange
      const userId = 1;
      cacheManager.set.mockResolvedValue(undefined);

      // Act
      await service.setUserPreferences(userId, {
        likes: [],
        dislikes: [],
      });

      // Assert
      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        CACHE_TTL.USER_PREFERENCES * 1000,
      );
    });
  });
});
