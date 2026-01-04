import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchRestaurantsDto } from './dto/search-restaurants.dto';
import { SearchRestaurantsResponse } from './interfaces/search.interface';
import { createMockService } from '../../test/utils/test-helpers';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';

describe('SearchController', () => {
  let controller: SearchController;
  let service: jest.Mocked<SearchService>;

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
    service = createMockService<SearchService>(['searchRestaurants']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        {
          provide: SearchService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<SearchController>(SearchController);
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

    it('should return restaurant search results', async () => {
      service.searchRestaurants.mockResolvedValue(mockSearchResponse);

      const result = await controller.searchRestaurants(validDto);

      expect(result).toEqual(mockSearchResponse);
      expect(service.searchRestaurants).toHaveBeenCalledWith(validDto);
      expect(service.searchRestaurants).toHaveBeenCalledTimes(1);
    });

    it('should pass DTO to service correctly', async () => {
      service.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await controller.searchRestaurants(validDto);

      expect(service.searchRestaurants).toHaveBeenCalledWith({
        menuName: '김치찌개',
        latitude: 37.5012345,
        longitude: 127.0398765,
        includeRoadAddress: false,
      });
    });

    it('should handle includeRoadAddress option', async () => {
      const dtoWithRoadAddress = { ...validDto, includeRoadAddress: true };
      service.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await controller.searchRestaurants(dtoWithRoadAddress);

      expect(service.searchRestaurants).toHaveBeenCalledWith({
        menuName: '김치찌개',
        latitude: 37.5012345,
        longitude: 127.0398765,
        includeRoadAddress: true,
      });
    });

    it('should return empty restaurants array when no results', async () => {
      const emptyResponse: SearchRestaurantsResponse = { restaurants: [] };
      service.searchRestaurants.mockResolvedValue(emptyResponse);

      const result = await controller.searchRestaurants(validDto);

      expect(result).toEqual(emptyResponse);
      expect(result.restaurants).toHaveLength(0);
    });

    it('should propagate BadRequestException from service', async () => {
      const error = new BadRequestException('menuName must not be empty');
      service.searchRestaurants.mockRejectedValue(error);

      await expect(controller.searchRestaurants(validDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.searchRestaurants(validDto)).rejects.toThrow(
        'menuName must not be empty',
      );
    });

    it('should propagate ExternalApiException from service', async () => {
      const error = new ExternalApiException(
        'Naver Search',
        new Error('API Error'),
      );
      service.searchRestaurants.mockRejectedValue(error);

      await expect(controller.searchRestaurants(validDto)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should handle service returning single restaurant', async () => {
      const singleRestaurantResponse: SearchRestaurantsResponse = {
        restaurants: [mockSearchResponse.restaurants[0]],
      };
      service.searchRestaurants.mockResolvedValue(singleRestaurantResponse);

      const result = await controller.searchRestaurants(validDto);

      expect(result.restaurants).toHaveLength(1);
      expect(result.restaurants[0].name).toBe('맛있는 식당');
    });

    it('should handle service returning multiple restaurants', async () => {
      service.searchRestaurants.mockResolvedValue(mockSearchResponse);

      const result = await controller.searchRestaurants(validDto);

      expect(result.restaurants).toHaveLength(2);
      expect(result.restaurants[0].name).toBe('맛있는 식당');
      expect(result.restaurants[1].name).toBe('특별한 음식점');
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
      service.searchRestaurants.mockResolvedValue(minimalResponse);

      const result = await controller.searchRestaurants(validDto);

      expect(result.restaurants[0]).toEqual({
        name: '간단한 식당',
        address: '서울',
      });
    });

    it('should handle different menu names', async () => {
      const pizzaDto = { ...validDto, menuName: '피자' };
      service.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await controller.searchRestaurants(pizzaDto);

      expect(service.searchRestaurants).toHaveBeenCalledWith(
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
      service.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await controller.searchRestaurants(busanDto);

      expect(service.searchRestaurants).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 35.1796,
          longitude: 129.0756,
        }),
      );
    });

    it('should handle edge case coordinates', async () => {
      const edgeDto = {
        menuName: '김치찌개',
        latitude: -90,
        longitude: 180,
        includeRoadAddress: false,
      };
      service.searchRestaurants.mockResolvedValue(mockSearchResponse);

      await controller.searchRestaurants(edgeDto);

      expect(service.searchRestaurants).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: -90,
          longitude: 180,
        }),
      );
    });

    it('should not modify the response from service', async () => {
      service.searchRestaurants.mockResolvedValue(mockSearchResponse);

      const result = await controller.searchRestaurants(validDto);

      expect(result).toBe(mockSearchResponse);
    });
  });
});
