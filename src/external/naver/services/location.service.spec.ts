import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LocationService } from './location.service';
import { NaverMapClient } from '@/external/naver/clients/naver-map.client';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { NaverReverseGeocodeResult } from '@/external/naver/naver.types';
import { createMockNaverMapClient } from '../../../../test/mocks/external-clients.mock';

describe('LocationService', () => {
  let service: LocationService;
  let naverMapClient: any;

  beforeEach(async () => {
    naverMapClient = createMockNaverMapClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: NaverMapClient, useValue: naverMapClient },
      ],
    }).compile();

    service = module.get<LocationService>(LocationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('reverseGeocode', () => {
    const latitude = 37.5012345;
    const longitude = 127.0398765;

    it('should successfully convert coordinates to address', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼동');
      expect(naverMapClient.reverseGeocode).toHaveBeenCalledWith(
        latitude,
        longitude,
        { includeRoadAddress: false },
      );
    });

    it('should include road address when option is true', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'roadaddr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
          land: {
            name: '테헤란로',
            number1: '123',
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude, true);

      expect(result).toBe('서울특별시 강남구 역삼동 테헤란로 123');
      expect(naverMapClient.reverseGeocode).toHaveBeenCalledWith(
        latitude,
        longitude,
        { includeRoadAddress: true },
      );
    });

    it('should prefer roadaddr result when available', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
        {
          name: 'roadaddr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should prefer addr result when roadaddr is not available', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
        {
          name: 'addr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼1동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼1동');
    });

    it('should use legalcode result when others are not available', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should build road address with land information', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'roadaddr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
          land: {
            name: '테헤란로',
            number1: '123',
            number2: '45',
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude, true);

      expect(result).toBe('서울특별시 강남구 역삼동 테헤란로 123 45');
    });

    it('should handle road address without number2', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'roadaddr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
          land: {
            name: '테헤란로',
            number1: '123',
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude, true);

      expect(result).toBe('서울특별시 강남구 역삼동 테헤란로 123');
    });

    it('should fallback to region address when road address fails', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'roadaddr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
          land: {
            name: '',
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude, true);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should handle area4 in region', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
            area4: { name: '123-45' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼동 123-45');
    });

    it('should use area0 when other areas are missing', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area0: { name: 'South Korea' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('South Korea');
    });

    it('should skip duplicate area names', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '서울특별시' },
            area3: { name: '강남구' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구');
    });

    it('should trim whitespace from area names', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '  서울특별시  ' },
            area2: { name: '  강남구  ' },
            area3: { name: '  역삼동  ' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should skip empty area names', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '' },
            area3: { name: '역삼동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 역삼동');
    });

    it('should throw BadRequestException when no results found', async () => {
      naverMapClient.reverseGeocode.mockResolvedValue([]);

      await expect(service.reverseGeocode(latitude, longitude)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when results is null', async () => {
      naverMapClient.reverseGeocode.mockResolvedValue(null);

      await expect(service.reverseGeocode(latitude, longitude)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when no valid address found', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      await expect(service.reverseGeocode(latitude, longitude)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.reverseGeocode(latitude, longitude)).rejects.toThrow(
        '주소를 찾을 수 없습니다.',
      );
    });

    it('should throw BadRequestException when region is empty', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {},
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      await expect(service.reverseGeocode(latitude, longitude)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ExternalApiException when Naver Map API fails', async () => {
      const error = new ExternalApiException(
        'Naver Map',
        new Error('API Error'),
        'Reverse Geocode에 실패했습니다.',
      );
      naverMapClient.reverseGeocode.mockRejectedValue(error);

      await expect(service.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should rethrow BadRequestException as is', async () => {
      naverMapClient.reverseGeocode.mockResolvedValue([]);

      try {
        await service.reverseGeocode(latitude, longitude);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).message).toBe(
          '주소를 찾을 수 없습니다.',
        );
      }
    });

    it('should wrap unknown errors in ExternalApiException', async () => {
      const unknownError = new Error('Unknown error');
      naverMapClient.reverseGeocode.mockRejectedValue(unknownError);

      try {
        await service.reverseGeocode(latitude, longitude);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ExternalApiException);
        expect((e as ExternalApiException).provider).toBe('Naver Map');
      }
    });

    it('should handle non-Error objects thrown by client', async () => {
      naverMapClient.reverseGeocode.mockRejectedValue('string error');

      await expect(service.reverseGeocode(latitude, longitude)).rejects.toThrow(
        ExternalApiException,
      );
    });

    it('should handle all result types in order', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'admcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼1동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should fallback to any available result when preferred types are missing', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'unknown',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should handle road address without land name', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'roadaddr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
          land: {
            number1: '123',
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude, true);

      expect(result).toBe('서울특별시 강남구 역삼동 123');
    });

    it('should handle road address with non-string values', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'roadaddr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
          land: {
            name: 123 as any,
            number1: 456 as any,
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude, true);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should not include road address when includeRoadAddress is false', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'roadaddr',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
          land: {
            name: '테헤란로',
            number1: '123',
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude, false);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should handle results without code field', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      const result = await service.reverseGeocode(latitude, longitude);

      expect(result).toBe('서울특별시 강남구 역삼동');
    });

    it('should use default includeRoadAddress value when not provided', async () => {
      const mockResults: NaverReverseGeocodeResult[] = [
        {
          name: 'legalcode',
          region: {
            area1: { name: '서울특별시' },
            area2: { name: '강남구' },
            area3: { name: '역삼동' },
          },
        },
      ];
      naverMapClient.reverseGeocode.mockResolvedValue(mockResults);

      await service.reverseGeocode(latitude, longitude);

      expect(naverMapClient.reverseGeocode).toHaveBeenCalledWith(
        latitude,
        longitude,
        { includeRoadAddress: false },
      );
    });
  });
});
