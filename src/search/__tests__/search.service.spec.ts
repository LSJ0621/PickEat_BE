import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SearchService } from '../search.service';
import { NaverSearchClient } from '@/external/naver/clients/naver-search.client';
import { LocationService } from '@/external/naver/services/location.service';
import { SearchRestaurantsDto } from '../dto/search-restaurants.dto';
import { NaverLocalSearchItem } from '../interfaces/search.interface';
import { createMockService } from '../../../test/utils/test-helpers';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';

describe('SearchService', () => {
  let service: SearchService;
  let locationService: jest.Mocked<LocationService>;
  let naverSearchClient: jest.Mocked<NaverSearchClient>;

  const mockNaverItems: NaverLocalSearchItem[] = [
    {
      title: '<b>맛있는</b> 식당',
      address: '서울특별시 강남구 역삼동 123-45',
      roadAddress: '서울특별시 강남구 테헤란로 123',
      telephone: '02-1234-5678',
      mapx: '1270398765',
      mapy: '375012345',
      distance: '1500',
      link: 'https://example.com',
    },
    {
      title: '&amp;특별한&amp; 음식점',
      address: '서울특별시 서초구 서초동 456-78',
      roadAddress: '서울특별시 서초구 강남대로 456',
      telephone: '02-9876-5432',
      mapx: '1270456789',
      mapy: '375123456',
      distance: '2500',
    },
  ];

  beforeEach(async () => {
    locationService = createMockService<LocationService>(['reverseGeocode']);
    naverSearchClient = createMockService<NaverSearchClient>(['searchLocal']);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: LocationService,
          useValue: locationService,
        },
        {
          provide: NaverSearchClient,
          useValue: naverSearchClient,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchRestaurants', () => {
    const validDto: SearchRestaurantsDto = {
      menuName: '김치찌개',
      latitude: 37.5012345,
      longitude: 127.0398765,
      includeRoadAddress: false,
    };

    it('should successfully search restaurants with valid input', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      const result = await service.searchRestaurants(validDto);

      expect(result).toHaveProperty('restaurants');
      expect(result.restaurants).toHaveLength(2);
      expect(locationService.reverseGeocode).toHaveBeenCalledWith(
        validDto.latitude,
        validDto.longitude,
        false,
      );
      expect(naverSearchClient.searchLocal).toHaveBeenCalledWith(
        '김치찌개 서울특별시 강남구 역삼동',
      );
    });

    it('should execute pipeline steps in order', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      await service.searchRestaurants(validDto);

      expect(locationService.reverseGeocode).toHaveBeenCalled();
      expect(naverSearchClient.searchLocal).toHaveBeenCalled();
    });

    it('should pass includeRoadAddress to reverseGeocode', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 테헤란로 123',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      const dtoWithRoadAddress = { ...validDto, includeRoadAddress: true };
      await service.searchRestaurants(dtoWithRoadAddress);

      expect(locationService.reverseGeocode).toHaveBeenCalledWith(
        validDto.latitude,
        validDto.longitude,
        true,
      );
    });

    it('should throw BadRequestException when menuName is empty string', async () => {
      const emptyDto = { ...validDto, menuName: '' };

      await expect(service.searchRestaurants(emptyDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.searchRestaurants(emptyDto)).rejects.toThrow(
        'menuName must not be empty',
      );
    });

    it('should throw BadRequestException when menuName is only whitespace', async () => {
      const whitespaceDto = { ...validDto, menuName: '   ' };

      await expect(service.searchRestaurants(whitespaceDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.searchRestaurants(whitespaceDto)).rejects.toThrow(
        'menuName must not be empty',
      );
    });

    it('should throw BadRequestException when no search results found', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([]);

      await expect(service.searchRestaurants(validDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.searchRestaurants(validDto)).rejects.toThrow(
        '검색 결과가 없습니다.',
      );
    });

    it('should propagate error when reverseGeocode fails', async () => {
      const error = new ExternalApiException(
        'Naver Map',
        new Error('API Error'),
      );
      locationService.reverseGeocode.mockRejectedValue(error);

      await expect(service.searchRestaurants(validDto)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should propagate error when searchLocal fails', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      const error = new ExternalApiException(
        'Naver Search',
        new Error('API Error'),
      );
      naverSearchClient.searchLocal.mockRejectedValue(error);

      await expect(service.searchRestaurants(validDto)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should log error when reverseGeocode step fails with Error instance', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      const apiError = new Error('Network timeout');
      const wrappedError = new ExternalApiException('Naver Map', apiError);
      locationService.reverseGeocode.mockRejectedValue(wrappedError);

      await expect(service.searchRestaurants(validDto)).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ [네이버 검색 단계 에러]'),
        expect.any(String),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('step=reverseGeocode'),
        expect.any(String),
      );
    });

    it('should log error when naverLocalSearch step fails with Error instance', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );

      const loggerSpy = jest.spyOn(service['logger'], 'error');
      const apiError = new Error('API rate limit exceeded');
      const wrappedError = new ExternalApiException('Naver Search', apiError);
      naverSearchClient.searchLocal.mockRejectedValue(wrappedError);

      await expect(service.searchRestaurants(validDto)).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ [네이버 검색 단계 에러]'),
        expect.any(String),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('step=naverLocalSearch'),
        expect.any(String),
      );
    });

    it('should handle non-Error exceptions in onStepError callback', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');
      const nonErrorException = 'string error';
      locationService.reverseGeocode.mockRejectedValue(nonErrorException);

      await expect(service.searchRestaurants(validDto)).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown error'),
        undefined,
      );
    });

    it('should handle undefined includeRoadAddress by defaulting to false', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      const dtoWithoutRoadAddress = {
        menuName: '김치찌개',
        latitude: 37.5012345,
        longitude: 127.0398765,
      };

      await service.searchRestaurants(dtoWithoutRoadAddress);

      expect(locationService.reverseGeocode).toHaveBeenCalledWith(
        dtoWithoutRoadAddress.latitude,
        dtoWithoutRoadAddress.longitude,
        false,
      );
    });

    it('should decode HTML entities in restaurant name', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].name).toBe('맛있는 식당');
      expect(result.restaurants[1].name).toBe('&특별한& 음식점');
    });

    it('should strip HTML tags from restaurant name', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].name).not.toContain('<b>');
      expect(result.restaurants[0].name).not.toContain('</b>');
      expect(result.restaurants[0].name).toBe('맛있는 식당');
    });

    it('should parse coordinates correctly', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].mapx).toBe(1270398765);
      expect(result.restaurants[0].mapy).toBe(375012345);
    });

    it('should convert distance from meters to kilometers', async () => {
      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].distance).toBe(1.5);
      expect(result.restaurants[1].distance).toBe(2.5);
    });

    it('should handle missing optional fields', async () => {
      const minimalItem: NaverLocalSearchItem = {
        title: '간단한 식당',
        address: '서울특별시 강남구',
      };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([minimalItem]);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0]).toEqual({
        name: '간단한 식당',
        address: '서울특별시 강남구',
        roadAddress: undefined,
        phone: undefined,
        mapx: undefined,
        mapy: undefined,
        distance: undefined,
        link: undefined,
      });
    });

    it('should handle invalid coordinate values', async () => {
      const invalidItem: NaverLocalSearchItem = {
        title: '식당',
        address: '서울',
        mapx: 'invalid',
        mapy: 'NaN',
      };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([invalidItem]);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].mapx).toBeUndefined();
      expect(result.restaurants[0].mapy).toBeUndefined();
    });

    it('should handle invalid distance values', async () => {
      const invalidItem: NaverLocalSearchItem = {
        title: '식당',
        address: '서울',
        distance: 'invalid',
      };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([invalidItem]);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].distance).toBeUndefined();
    });

    it('should decode various HTML entities', async () => {
      const itemsWithEntities: NaverLocalSearchItem[] = [
        {
          title: '&lt;특별&gt; 식당 &quot;맛집&quot;',
          address: '서울',
        },
        {
          title: '&#39;맛있는&#39; 음식점 &apos;추천&apos;',
          address: '서울',
        },
        {
          title: '공백&nbsp;테스트 &#65; &#x42;',
          address: '서울',
        },
      ];

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(itemsWithEntities);

      const result = await service.searchRestaurants(validDto);

      // Note: HTML tags are stripped, but HTML entities are decoded
      expect(result.restaurants[0].name).toBe('식당 "맛집"');
      expect(result.restaurants[1].name).toBe("'맛있는' 음식점 '추천'");
      expect(result.restaurants[2].name).toBe('공백 테스트 A B');
    });

    it('should handle empty title gracefully', async () => {
      const emptyTitleItem: NaverLocalSearchItem = {
        title: '',
        address: '서울',
      };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([emptyTitleItem]);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].name).toBe('');
    });

    it('should handle undefined title', async () => {
      const undefinedTitleItem: NaverLocalSearchItem = {
        title: undefined as unknown as string,
        address: '서울',
      };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([undefinedTitleItem]);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].name).toBe('');
    });

    it('should trim menuName before processing', async () => {
      const dtoWithWhitespace = { ...validDto, menuName: '  김치찌개  ' };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue(mockNaverItems);

      await service.searchRestaurants(dtoWithWhitespace);

      expect(naverSearchClient.searchLocal).toHaveBeenCalledWith(
        '김치찌개 서울특별시 강남구 역삼동',
      );
    });

    it('should handle zero distance', async () => {
      const zeroDistanceItem: NaverLocalSearchItem = {
        title: '바로 옆 식당',
        address: '서울',
        distance: '0',
      };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([zeroDistanceItem]);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].distance).toBe(0);
    });

    it('should return empty string when address is undefined or empty after stripping', async () => {
      const itemWithEmptyAddress: NaverLocalSearchItem = {
        title: '식당',
        address: undefined as unknown as string,
      };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([itemWithEmptyAddress]);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].address).toBe('');
    });

    it('should return empty string when address contains only HTML tags', async () => {
      const itemWithOnlyTagsAddress: NaverLocalSearchItem = {
        title: '식당',
        address: '<b></b>  ',
      };

      locationService.reverseGeocode.mockResolvedValue(
        '서울특별시 강남구 역삼동',
      );
      naverSearchClient.searchLocal.mockResolvedValue([
        itemWithOnlyTagsAddress,
      ]);

      const result = await service.searchRestaurants(validDto);

      expect(result.restaurants[0].address).toBe('');
    });
  });
});
