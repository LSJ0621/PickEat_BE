import { Test, TestingModule } from '@nestjs/testing';
import { AddressSearchService } from './address-search.service';
import { KakaoLocalClient } from '@/external/kakao/clients/kakao-local.client';
import { SearchAddressDto } from '../dto/search-address.dto';
import { createMockKakaoLocalClient } from '../../../test/mocks/external-clients.mock';

describe('AddressSearchService', () => {
  let service: AddressSearchService;
  let mockKakaoLocalClient: jest.Mocked<
    ReturnType<typeof createMockKakaoLocalClient>
  >;

  beforeEach(async () => {
    mockKakaoLocalClient = createMockKakaoLocalClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressSearchService,
        {
          provide: KakaoLocalClient,
          useValue: mockKakaoLocalClient,
        },
      ],
    }).compile();

    service = module.get<AddressSearchService>(AddressSearchService);
  });

  describe('searchAddress', () => {
    it('should search address and return results', async () => {
      // Arrange
      const searchDto: SearchAddressDto = {
        query: '서울특별시 강남구 테헤란로 123',
      };
      const mockResponse = {
        meta: {
          total_count: 1,
          pageable_count: 1,
          is_end: true,
        },
        addresses: [
          {
            address: '서울특별시 강남구 역삼동',
            roadAddress: '서울특별시 강남구 테헤란로 123',
            postalCode: '06234',
            latitude: '37.5012345',
            longitude: '127.0398765',
          },
        ],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(mockKakaoLocalClient.searchAddress).toHaveBeenCalledWith(
        searchDto.query,
      );
    });

    it('should search by partial address', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '강남구 테헤란로' };
      const mockResponse = {
        meta: {
          total_count: 5,
          pageable_count: 5,
          is_end: false,
        },
        addresses: [
          {
            address: '서울특별시 강남구 역삼동',
            roadAddress: '서울특별시 강남구 테헤란로 123',
            postalCode: '06234',
            latitude: '37.5012345',
            longitude: '127.0398765',
          },
        ],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.meta.total_count).toBe(5);
      expect(result.addresses).toHaveLength(1);
    });

    it('should return empty results when no address found', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '존재하지않는주소12345' };
      const mockResponse = {
        meta: {
          total_count: 0,
          pageable_count: 0,
          is_end: true,
        },
        addresses: [],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.meta.total_count).toBe(0);
      expect(result.addresses).toEqual([]);
    });

    it('should search by building name', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '서울시청' };
      const mockResponse = {
        meta: {
          total_count: 1,
          pageable_count: 1,
          is_end: true,
        },
        addresses: [
          {
            address: '서울특별시 중구 태평로1가',
            roadAddress: '서울특별시 중구 세종대로 110',
            postalCode: '04524',
            latitude: '37.5663',
            longitude: '126.9779',
          },
        ],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].roadAddress).toContain('세종대로');
    });

    it('should search by postal code', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '06234' };
      const mockResponse = {
        meta: {
          total_count: 10,
          pageable_count: 10,
          is_end: false,
        },
        addresses: [
          {
            address: '서울특별시 강남구 역삼동',
            roadAddress: '서울특별시 강남구 테헤란로 123',
            postalCode: '06234',
            latitude: '37.5012345',
            longitude: '127.0398765',
          },
        ],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.addresses[0].postalCode).toBe('06234');
    });

    it('should handle addresses without road address', async () => {
      // Arrange
      const searchDto: SearchAddressDto = {
        query: '제주특별자치도 서귀포시 산록남로 123',
      };
      const mockResponse = {
        meta: {
          total_count: 1,
          pageable_count: 1,
          is_end: true,
        },
        addresses: [
          {
            address: '제주특별자치도 서귀포시 동홍동',
            roadAddress: null,
            postalCode: null,
            latitude: '33.2541',
            longitude: '126.5601',
          },
        ],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.addresses[0].roadAddress).toBeNull();
      expect(result.addresses[0].postalCode).toBeNull();
    });

    it('should return multiple addresses for ambiguous queries', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '중앙로 1' };
      const mockResponse = {
        meta: {
          total_count: 100,
          pageable_count: 10,
          is_end: false,
        },
        addresses: [
          {
            address: '서울특별시 강남구 역삼동',
            roadAddress: '서울특별시 강남구 중앙로 1',
            postalCode: '06234',
            latitude: '37.5012345',
            longitude: '127.0398765',
          },
          {
            address: '부산광역시 해운대구 우동',
            roadAddress: '부산광역시 해운대구 중앙로 1',
            postalCode: '48095',
            latitude: '35.1635',
            longitude: '129.1635',
          },
        ],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.meta.total_count).toBe(100);
      expect(result.addresses.length).toBeGreaterThan(1);
    });

    it('should handle special characters in query', async () => {
      // Arrange
      const searchDto: SearchAddressDto = {
        query: '서울시 강남구 테헤란로 123-45',
      };
      const mockResponse = {
        meta: {
          total_count: 1,
          pageable_count: 1,
          is_end: true,
        },
        addresses: [
          {
            address: '서울특별시 강남구 역삼동 123-45',
            roadAddress: '서울특별시 강남구 테헤란로 123',
            postalCode: '06234',
            latitude: '37.5012345',
            longitude: '127.0398765',
          },
        ],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.addresses[0].address).toContain('123-45');
    });

    it('should pass through API errors from KakaoLocalClient', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '서울시 강남구' };
      const error = new Error('Kakao API error');

      mockKakaoLocalClient.searchAddress.mockRejectedValue(error);

      // Act & Assert
      await expect(service.searchAddress(searchDto)).rejects.toThrow(
        'Kakao API error',
      );
      expect(mockKakaoLocalClient.searchAddress).toHaveBeenCalledWith(
        searchDto.query,
      );
    });

    it('should handle Korean and English mixed queries', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: 'Seoul 강남구 Teheran-ro' };
      const mockResponse = {
        meta: {
          total_count: 1,
          pageable_count: 1,
          is_end: true,
        },
        addresses: [
          {
            address: '서울특별시 강남구 역삼동',
            roadAddress: '서울특별시 강남구 테헤란로',
            postalCode: '06234',
            latitude: '37.5012345',
            longitude: '127.0398765',
          },
        ],
      };

      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.addresses).toHaveLength(1);
    });
  });
});
