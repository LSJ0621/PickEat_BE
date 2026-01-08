import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { MapController } from '../map.controller';
import { MapService } from '../map.service';
import { SearchRestaurantsDto } from '../../search/dto/search-restaurants.dto';
import { MapRestaurantsResponse } from '../interfaces/map.interface';
import { createMockService } from '../../../test/utils/test-helpers';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';

describe('MapController', () => {
  let controller: MapController;
  let service: jest.Mocked<MapService>;

  const mockMarkersResponse: MapRestaurantsResponse = {
    markers: [
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
    service = createMockService<MapService>(['getRestaurantMarkers']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MapController],
      providers: [
        {
          provide: MapService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<MapController>(MapController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should have JwtAuthGuard applied to controller', () => {
      const guards = Reflect.getMetadata('__guards__', MapController);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('getRestaurantMarkers', () => {
    const validDto: SearchRestaurantsDto = {
      menuName: '김치찌개',
      latitude: 37.5012345,
      longitude: 127.0398765,
      includeRoadAddress: false,
    };

    describe('Success Cases', () => {
      it('should return restaurant markers from service', async () => {
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        const result = await controller.getRestaurantMarkers(validDto);

        expect(result).toEqual(mockMarkersResponse);
        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(validDto);
        expect(service.getRestaurantMarkers).toHaveBeenCalledTimes(1);
      });

      it('should pass DTO to service correctly', async () => {
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(validDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith({
          menuName: '김치찌개',
          latitude: 37.5012345,
          longitude: 127.0398765,
          includeRoadAddress: false,
        });
      });

      it('should handle includeRoadAddress option', async () => {
        const dtoWithRoadAddress = { ...validDto, includeRoadAddress: true };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(dtoWithRoadAddress);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith({
          menuName: '김치찌개',
          latitude: 37.5012345,
          longitude: 127.0398765,
          includeRoadAddress: true,
        });
      });

      it('should return empty markers array when no results', async () => {
        const emptyResponse: MapRestaurantsResponse = { markers: [] };
        service.getRestaurantMarkers.mockResolvedValue(emptyResponse);

        const result = await controller.getRestaurantMarkers(validDto);

        expect(result).toEqual(emptyResponse);
        expect(result.markers).toHaveLength(0);
      });

      it('should handle single restaurant marker', async () => {
        const singleMarkerResponse: MapRestaurantsResponse = {
          markers: [mockMarkersResponse.markers[0]],
        };
        service.getRestaurantMarkers.mockResolvedValue(singleMarkerResponse);

        const result = await controller.getRestaurantMarkers(validDto);

        expect(result.markers).toHaveLength(1);
        expect(result.markers[0].name).toBe('맛있는 식당');
      });

      it('should handle multiple restaurant markers', async () => {
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        const result = await controller.getRestaurantMarkers(validDto);

        expect(result.markers).toHaveLength(2);
        expect(result.markers[0].name).toBe('맛있는 식당');
        expect(result.markers[1].name).toBe('특별한 음식점');
      });

      it('should handle large number of restaurant markers', async () => {
        const manyMarkers: MapRestaurantsResponse = {
          markers: Array.from({ length: 100 }, (_, i) => ({
            name: `식당 ${i + 1}`,
            address: `주소 ${i + 1}`,
            mapx: 127.0 + i,
            mapy: 37.5 + i,
          })),
        };
        service.getRestaurantMarkers.mockResolvedValue(manyMarkers);

        const result = await controller.getRestaurantMarkers(validDto);

        expect(result.markers).toHaveLength(100);
        expect(result.markers[0].name).toBe('식당 1');
        expect(result.markers[99].name).toBe('식당 100');
      });
    });

    describe('DTO Validation Scenarios', () => {
      it('should handle different menu names', async () => {
        const pizzaDto = { ...validDto, menuName: '피자' };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(pizzaDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
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
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(busanDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
          expect.objectContaining({
            latitude: 35.1796,
            longitude: 129.0756,
          }),
        );
      });

      it('should handle edge case latitude values', async () => {
        const northPoleDto = {
          menuName: '김치찌개',
          latitude: 90,
          longitude: 127.0,
          includeRoadAddress: false,
        };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(northPoleDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
          expect.objectContaining({ latitude: 90 }),
        );
      });

      it('should handle edge case longitude values', async () => {
        const eastEdgeDto = {
          menuName: '김치찌개',
          latitude: 37.5,
          longitude: 180,
          includeRoadAddress: false,
        };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(eastEdgeDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
          expect.objectContaining({ longitude: 180 }),
        );
      });

      it('should handle negative latitude values', async () => {
        const southDto = {
          menuName: '김치찌개',
          latitude: -45.0,
          longitude: 127.0,
          includeRoadAddress: false,
        };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(southDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
          expect.objectContaining({ latitude: -45.0 }),
        );
      });

      it('should handle negative longitude values', async () => {
        const westDto = {
          menuName: '김치찌개',
          latitude: 37.5,
          longitude: -127.0,
          includeRoadAddress: false,
        };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(westDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
          expect.objectContaining({ longitude: -127.0 }),
        );
      });

      it('should handle minimum latitude boundary', async () => {
        const southPoleDto = {
          menuName: '김치찌개',
          latitude: -90,
          longitude: 127.0,
          includeRoadAddress: false,
        };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(southPoleDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
          expect.objectContaining({ latitude: -90 }),
        );
      });

      it('should handle minimum longitude boundary', async () => {
        const westEdgeDto = {
          menuName: '김치찌개',
          latitude: 37.5,
          longitude: -180,
          includeRoadAddress: false,
        };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(westEdgeDto);

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
          expect.objectContaining({ longitude: -180 }),
        );
      });

      it('should work without optional includeRoadAddress', async () => {
        const dtoWithoutOptional = {
          menuName: '김치찌개',
          latitude: 37.5,
          longitude: 127.0,
        };
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        await controller.getRestaurantMarkers(
          dtoWithoutOptional as SearchRestaurantsDto,
        );

        expect(service.getRestaurantMarkers).toHaveBeenCalledWith(
          dtoWithoutOptional,
        );
      });
    });

    describe('Error Handling', () => {
      it('should propagate BadRequestException from service', async () => {
        const error = new BadRequestException('menuName must not be empty');
        service.getRestaurantMarkers.mockRejectedValue(error);

        await expect(controller.getRestaurantMarkers(validDto)).rejects.toThrow(
          BadRequestException,
        );
        await expect(controller.getRestaurantMarkers(validDto)).rejects.toThrow(
          'menuName must not be empty',
        );
      });

      it('should propagate ExternalApiException from service', async () => {
        const error = new ExternalApiException(
          'Naver Search',
          new Error('API Error'),
        );
        service.getRestaurantMarkers.mockRejectedValue(error);

        await expect(controller.getRestaurantMarkers(validDto)).rejects.toThrow(
          ExternalApiException,
        );
      });

      it('should propagate InternalServerErrorException from service', async () => {
        const error = new InternalServerErrorException(
          'Internal server error occurred',
        );
        service.getRestaurantMarkers.mockRejectedValue(error);

        await expect(controller.getRestaurantMarkers(validDto)).rejects.toThrow(
          InternalServerErrorException,
        );
        await expect(controller.getRestaurantMarkers(validDto)).rejects.toThrow(
          'Internal server error occurred',
        );
      });

      it('should propagate generic Error from service', async () => {
        const error = new Error('Unexpected error');
        service.getRestaurantMarkers.mockRejectedValue(error);

        await expect(controller.getRestaurantMarkers(validDto)).rejects.toThrow(
          'Unexpected error',
        );
      });

      it('should handle service timeout errors', async () => {
        const timeoutError = new Error('Request timeout');
        service.getRestaurantMarkers.mockRejectedValue(timeoutError);

        await expect(controller.getRestaurantMarkers(validDto)).rejects.toThrow(
          'Request timeout',
        );
      });
    });

    describe('Response Validation', () => {
      it('should not modify the response from service', async () => {
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        const result = await controller.getRestaurantMarkers(validDto);

        expect(result).toBe(mockMarkersResponse);
      });

      it('should return response with correct structure', async () => {
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        const result = await controller.getRestaurantMarkers(validDto);

        expect(result).toHaveProperty('markers');
        expect(Array.isArray(result.markers)).toBe(true);
      });

      it('should preserve all marker properties', async () => {
        service.getRestaurantMarkers.mockResolvedValue(mockMarkersResponse);

        const result = await controller.getRestaurantMarkers(validDto);

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
      });
    });
  });
});
