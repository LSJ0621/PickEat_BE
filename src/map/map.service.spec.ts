import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MapService } from './map.service';
import { SearchService } from '@/search/search.service';
import { SearchRestaurantsDto } from '@/search/dto/search-restaurants.dto';
import { SearchRestaurantsResponse } from '@/search/interfaces/search.interface';
import { MapRestaurantsResponse } from './interfaces/map.interface';
import { createMockService } from '../../test/utils/test-helpers';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';

describe('MapService', () => {
  let service: MapService;
  let searchService: jest.Mocked<SearchService>;

  const mockSearchResponse: SearchRestaurantsResponse = {
    restaurants: [
      {
        name: '맛있는 식당',
        address: '서울특별시 강남구 역삼동 123-45',
        roadAddress: '서울특별시 강남구 테헤란로 123',
        phone: '02-1234-5678',
        mapx: 1270398765,
        mapy: 375012345,
        distance: 1.5,
        link: 'https://example.com',
      },
      {
        name: '특별한 음식점',
        address: '서울특별시 서초구 서초동 456-78',
        roadAddress: '서울특별시 서초구 강남대로 456',
        phone: '02-9876-5432',
        mapx: 1270456789,
        mapy: 375123456,
        distance: 2.5,
      },
    ],
  };

  beforeEach(async () => {
    searchService = createMockService<SearchService>(['searchRestaurants']);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MapService,
        {
          provide: SearchService,
          useValue: searchService,
        },
      ],
    }).compile();

    service = module.get<MapService>(MapService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRestaurantMarkers', () => {
    const validDto: SearchRestaurantsDto = {
      menuName: '김치찌개',
      latitude: 37.5012345,
      longitude: 127.0398765,
      includeRoadAddress: false,
    };

    it('should convert search results to map markers', async () => {
      searchService.searchRestaurants.mockResolvedValue(mockSearchResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result).toHaveProperty('markers');
      expect(result.markers).toHaveLength(2);
      expect(searchService.searchRestaurants).toHaveBeenCalledWith(validDto);
    });

    it('should preserve all restaurant properties in markers', async () => {
      searchService.searchRestaurants.mockResolvedValue(mockSearchResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers[0]).toEqual({
        name: '맛있는 식당',
        address: '서울특별시 강남구 역삼동 123-45',
        roadAddress: '서울특별시 강남구 테헤란로 123',
        phone: '02-1234-5678',
        mapx: 1270398765,
        mapy: 375012345,
        distance: 1.5,
        link: 'https://example.com',
      });

      expect(result.markers[1]).toEqual({
        name: '특별한 음식점',
        address: '서울특별시 서초구 서초동 456-78',
        roadAddress: '서울특별시 서초구 강남대로 456',
        phone: '02-9876-5432',
        mapx: 1270456789,
        mapy: 375123456,
        distance: 2.5,
      });
    });

    it('should handle empty search results', async () => {
      const emptyResponse: SearchRestaurantsResponse = { restaurants: [] };
      searchService.searchRestaurants.mockResolvedValue(emptyResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers).toHaveLength(0);
      expect(result).toEqual({ markers: [] });
    });

    it('should handle single restaurant result', async () => {
      const singleResponse: SearchRestaurantsResponse = {
        restaurants: [mockSearchResponse.restaurants[0]],
      };
      searchService.searchRestaurants.mockResolvedValue(singleResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers).toHaveLength(1);
      expect(result.markers[0].name).toBe('맛있는 식당');
    });

    it('should handle restaurants with minimal data', async () => {
      const minimalResponse: SearchRestaurantsResponse = {
        restaurants: [
          {
            name: '간단한 식당',
            address: '서울',
          },
        ],
      };
      searchService.searchRestaurants.mockResolvedValue(minimalResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers[0]).toEqual({
        name: '간단한 식당',
        address: '서울',
        roadAddress: undefined,
        phone: undefined,
        mapx: undefined,
        mapy: undefined,
        distance: undefined,
        link: undefined,
      });
    });

    it('should pass includeRoadAddress to search service', async () => {
      const dtoWithRoadAddress = { ...validDto, includeRoadAddress: true };
      searchService.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await service.getRestaurantMarkers(dtoWithRoadAddress);

      expect(searchService.searchRestaurants).toHaveBeenCalledWith({
        menuName: '김치찌개',
        latitude: 37.5012345,
        longitude: 127.0398765,
        includeRoadAddress: true,
      });
    });

    it('should propagate BadRequestException from search service', async () => {
      const error = new BadRequestException('menuName must not be empty');
      searchService.searchRestaurants.mockRejectedValue(error);

      await expect(service.getRestaurantMarkers(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should propagate ExternalApiException from search service', async () => {
      const error = new ExternalApiException(
        'Naver Search',
        new Error('API Error'),
      );
      searchService.searchRestaurants.mockRejectedValue(error);

      await expect(service.getRestaurantMarkers(validDto)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should handle restaurants without coordinates', async () => {
      const noCoordinatesResponse: SearchRestaurantsResponse = {
        restaurants: [
          {
            name: '좌표 없는 식당',
            address: '서울',
            mapx: undefined,
            mapy: undefined,
          },
        ],
      };
      searchService.searchRestaurants.mockResolvedValue(noCoordinatesResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers[0]).toEqual({
        name: '좌표 없는 식당',
        address: '서울',
        roadAddress: undefined,
        phone: undefined,
        mapx: undefined,
        mapy: undefined,
        distance: undefined,
        link: undefined,
      });
    });

    it('should handle restaurants without optional fields', async () => {
      const noOptionalFieldsResponse: SearchRestaurantsResponse = {
        restaurants: [
          {
            name: '기본 식당',
            address: '서울시 강남구',
            mapx: 127.0,
            mapy: 37.5,
          },
        ],
      };
      searchService.searchRestaurants.mockResolvedValue(
        noOptionalFieldsResponse,
      );

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers[0].roadAddress).toBeUndefined();
      expect(result.markers[0].phone).toBeUndefined();
      expect(result.markers[0].distance).toBeUndefined();
      expect(result.markers[0].link).toBeUndefined();
    });

    it('should convert multiple restaurants correctly', async () => {
      searchService.searchRestaurants.mockResolvedValue(mockSearchResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers).toHaveLength(2);
      result.markers.forEach((marker, index) => {
        expect(marker.name).toBe(mockSearchResponse.restaurants[index].name);
        expect(marker.address).toBe(
          mockSearchResponse.restaurants[index].address,
        );
        expect(marker.roadAddress).toBe(
          mockSearchResponse.restaurants[index].roadAddress,
        );
        expect(marker.phone).toBe(mockSearchResponse.restaurants[index].phone);
        expect(marker.mapx).toBe(mockSearchResponse.restaurants[index].mapx);
        expect(marker.mapy).toBe(mockSearchResponse.restaurants[index].mapy);
        expect(marker.distance).toBe(
          mockSearchResponse.restaurants[index].distance,
        );
        expect(marker.link).toBe(mockSearchResponse.restaurants[index].link);
      });
    });

    it('should handle different menu names', async () => {
      const pizzaDto = { ...validDto, menuName: '피자' };
      searchService.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await service.getRestaurantMarkers(pizzaDto);

      expect(searchService.searchRestaurants).toHaveBeenCalledWith(
        expect.objectContaining({ menuName: '피자' }),
      );
    });

    it('should handle different coordinates', async () => {
      const busanDto = {
        menuName: '국밥',
        latitude: 35.1796,
        longitude: 129.0756,
        includeRoadAddress: false,
      };
      searchService.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await service.getRestaurantMarkers(busanDto);

      expect(searchService.searchRestaurants).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 35.1796,
          longitude: 129.0756,
        }),
      );
    });

    it('should return MapRestaurantsResponse structure', async () => {
      searchService.searchRestaurants.mockResolvedValue(mockSearchResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result).toHaveProperty('markers');
      expect(Array.isArray(result.markers)).toBe(true);
    });

    it('should handle large number of restaurants', async () => {
      const manyRestaurants: SearchRestaurantsResponse = {
        restaurants: Array.from({ length: 50 }, (_, i) => ({
          name: `식당 ${i + 1}`,
          address: `주소 ${i + 1}`,
          mapx: 127.0 + i,
          mapy: 37.5 + i,
        })),
      };
      searchService.searchRestaurants.mockResolvedValue(manyRestaurants);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers).toHaveLength(50);
      expect(result.markers[0].name).toBe('식당 1');
      expect(result.markers[49].name).toBe('식당 50');
    });

    it('should handle zero distance values', async () => {
      const zeroDistanceResponse: SearchRestaurantsResponse = {
        restaurants: [
          {
            name: '바로 옆 식당',
            address: '서울',
            distance: 0,
          },
        ],
      };
      searchService.searchRestaurants.mockResolvedValue(zeroDistanceResponse);

      const result = await service.getRestaurantMarkers(validDto);

      expect(result.markers[0].distance).toBe(0);
    });

    it('should not modify original search results', async () => {
      const originalResponse = { ...mockSearchResponse };
      searchService.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await service.getRestaurantMarkers(validDto);

      expect(mockSearchResponse).toEqual(originalResponse);
    });
  });
});
