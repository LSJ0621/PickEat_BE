import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AddressSearchService } from '../../services/address-search.service';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import { KakaoLocalClient } from '@/external/kakao/clients/kakao-local.client';
import { SearchAddressDto } from '../../dto/search-address.dto';
import {
  createMockGooglePlacesClient,
  createMockKakaoLocalClient,
} from '../../../../test/mocks/external-clients.mock';

describe('AddressSearchService', () => {
  let service: AddressSearchService;
  let mockKakaoLocalClient: jest.Mocked<
    ReturnType<typeof createMockKakaoLocalClient>
  >;
  let mockGooglePlacesClient: jest.Mocked<
    ReturnType<typeof createMockGooglePlacesClient>
  >;

  const createTestModule = async (provider: string = 'kakao') => {
    jest.clearAllMocks();
    mockKakaoLocalClient = createMockKakaoLocalClient();
    mockGooglePlacesClient = createMockGooglePlacesClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressSearchService,
        {
          provide: KakaoLocalClient,
          useValue: mockKakaoLocalClient,
        },
        {
          provide: GooglePlacesClient,
          useValue: mockGooglePlacesClient,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(provider),
          },
        },
      ],
    }).compile();

    service = module.get<AddressSearchService>(AddressSearchService);
  };

  describe('with Kakao provider (default)', () => {
    beforeEach(async () => {
      await createTestModule('kakao');
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
    });
  });

  describe('with Google provider', () => {
    beforeEach(async () => {
      await createTestModule('google');
    });

    it('should create session token and use it for autocomplete and details', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '강남역' };
      const mockSessionToken = 'mock-session-token-12345678';
      const mockSuggestions = [
        {
          placePrediction: {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            text: { text: '강남역, 서울특별시' },
          },
        },
      ];
      const mockDetails = {
        formattedAddress: '서울특별시 강남구 강남대로 396',
        location: { latitude: 37.498095, longitude: 127.02761 },
      };

      mockGooglePlacesClient.createSessionToken.mockReturnValue(
        mockSessionToken,
      );
      mockGooglePlacesClient.autocomplete.mockResolvedValue(mockSuggestions);
      mockGooglePlacesClient.getDetails.mockResolvedValue(mockDetails);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(mockGooglePlacesClient.createSessionToken).toHaveBeenCalled();
      expect(mockGooglePlacesClient.autocomplete).toHaveBeenCalledWith(
        searchDto.query,
        expect.objectContaining({
          sessionToken: mockSessionToken,
          languageCode: 'ko',
          // includedRegionCodes 제거됨 - 전 세계 검색 지원
        }),
      );
      expect(mockGooglePlacesClient.getDetails).toHaveBeenCalledWith(
        'ChIJN1t_tDeuEmsRUsoyG83frY4',
        expect.objectContaining({
          useMinimalFields: true,
          sessionToken: mockSessionToken,
          languageCode: 'ko',
        }),
      );
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].latitude).toBe('37.498095');
      expect(result.addresses[0].longitude).toBe('127.02761');
    });

    it('should map Google response to AddressSearchResponse format', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '서울시청' };
      const mockSuggestions = [
        {
          placePrediction: {
            placeId: 'place-1',
            text: { text: '서울시청, 서울특별시 중구' },
          },
        },
      ];
      const mockDetails = {
        formattedAddress: '서울특별시 중구 세종대로 110',
        location: { latitude: 37.5663, longitude: 126.9779 },
      };

      mockGooglePlacesClient.autocomplete.mockResolvedValue(mockSuggestions);
      mockGooglePlacesClient.getDetails.mockResolvedValue(mockDetails);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.meta).toEqual({
        total_count: 1,
        pageable_count: 1,
        is_end: true,
      });
      expect(result.addresses[0]).toEqual({
        address: '서울특별시 중구 세종대로 110',
        roadAddress: '서울특별시 중구 세종대로 110',
        postalCode: null, // Google doesn't provide postal code
        latitude: '37.5663',
        longitude: '126.9779',
      });
    });

    it('should handle empty suggestions', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '존재하지않는주소' };
      mockGooglePlacesClient.autocomplete.mockResolvedValue([]);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.meta.total_count).toBe(0);
      expect(result.addresses).toEqual([]);
      expect(mockGooglePlacesClient.getDetails).not.toHaveBeenCalled();
    });

    it('should filter null results from details', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '강남' };
      const mockSuggestions = [
        {
          placePrediction: {
            placeId: 'place-1',
            text: { text: '강남역' },
          },
        },
        {
          placePrediction: {
            placeId: 'place-2',
            text: { text: '강남구청' },
          },
        },
      ];

      mockGooglePlacesClient.autocomplete.mockResolvedValue(mockSuggestions);
      mockGooglePlacesClient.getDetails
        .mockResolvedValueOnce({
          formattedAddress: '서울특별시 강남구 강남대로',
          location: { latitude: 37.498, longitude: 127.027 },
        })
        .mockResolvedValueOnce(null); // Second place has no details

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result.addresses).toHaveLength(1);
      expect(result.meta.total_count).toBe(1);
    });

    it('should handle partial failures in details calls with Promise.allSettled', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '테스트' };
      const mockSuggestions = [
        {
          placePrediction: {
            placeId: 'place-1',
            text: { text: '테스트 장소 1' },
          },
        },
        {
          placePrediction: {
            placeId: 'place-2',
            text: { text: '테스트 장소 2' },
          },
        },
      ];

      mockGooglePlacesClient.autocomplete.mockResolvedValue(mockSuggestions);
      mockGooglePlacesClient.getDetails
        .mockResolvedValueOnce({
          formattedAddress: '테스트 주소 1',
          location: { latitude: 37.5, longitude: 127.0 },
        })
        .mockRejectedValueOnce(new Error('API Error')); // Second call fails

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert - should still return the successful result
      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].address).toBe('테스트 주소 1');
    });

    it('should search worldwide without region restriction', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '서울' };
      mockGooglePlacesClient.autocomplete.mockResolvedValue([]);

      // Act
      await service.searchAddress(searchDto);

      // Assert - includedRegionCodes가 없어야 전 세계 검색 가능
      expect(mockGooglePlacesClient.autocomplete).toHaveBeenCalledWith(
        '서울',
        expect.objectContaining({
          languageCode: 'ko',
        }),
      );
      // includedRegionCodes가 전달되지 않았는지 확인
      const callArgs = mockGooglePlacesClient.autocomplete.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('includedRegionCodes');
    });
  });

  describe('provider configuration', () => {
    it('should default to kakao when not configured', async () => {
      await createTestModule('');

      const searchDto: SearchAddressDto = { query: '강남구' };
      const mockResponse = {
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        addresses: [
          {
            address: '서울특별시 강남구',
            roadAddress: null,
            postalCode: null,
            latitude: '37.5',
            longitude: '127.0',
          },
        ],
      };
      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      await service.searchAddress(searchDto);

      expect(mockKakaoLocalClient.searchAddress).toHaveBeenCalled();
      expect(mockGooglePlacesClient.autocomplete).not.toHaveBeenCalled();
    });

    it('should use google when configured', async () => {
      await createTestModule('google');

      const searchDto: SearchAddressDto = { query: '강남구' };
      mockGooglePlacesClient.autocomplete.mockResolvedValue([]);

      await service.searchAddress(searchDto);

      expect(mockGooglePlacesClient.autocomplete).toHaveBeenCalled();
      expect(mockKakaoLocalClient.searchAddress).not.toHaveBeenCalled();
    });

    it('should fallback to kakao for invalid provider value', async () => {
      await createTestModule('invalid-provider');

      const searchDto: SearchAddressDto = { query: '강남구' };
      const mockResponse = {
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        addresses: [
          {
            address: '서울특별시 강남구',
            roadAddress: null,
            postalCode: null,
            latitude: '37.5',
            longitude: '127.0',
          },
        ],
      };
      mockKakaoLocalClient.searchAddress.mockResolvedValue(mockResponse);

      await service.searchAddress(searchDto);

      expect(mockKakaoLocalClient.searchAddress).toHaveBeenCalled();
      expect(mockGooglePlacesClient.autocomplete).not.toHaveBeenCalled();
    });
  });
});
