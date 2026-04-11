import { Test, TestingModule } from '@nestjs/testing';
import { AddressSearchService } from '@/user/services/address-search.service';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import type {
  GooglePlaceDetails,
  GooglePlacesAutocompleteSuggestion,
} from '@/external/google/google.types';

describe('AddressSearchService', () => {
  let service: AddressSearchService;

  const mockGooglePlacesClient = {
    createSessionToken: jest.fn(),
    autocomplete: jest.fn(),
    getDetails: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockGooglePlacesClient.createSessionToken.mockReturnValue('test-session-token-uuid');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressSearchService,
        { provide: GooglePlacesClient, useValue: mockGooglePlacesClient },
      ],
    }).compile();

    service = module.get<AddressSearchService>(AddressSearchService);
  });

  // =====================
  // searchWithGoogle — 정상 응답 파싱
  // =====================
  describe('searchAddress → searchWithGoogle (정상 응답 파싱)', () => {
    it('예측과 상세 정보를 파싱해 AddressSearchResult 배열을 반환한다', async () => {
      const suggestions: GooglePlacesAutocompleteSuggestion[] = [
        {
          placePrediction: {
            placeId: 'place_id_1',
            text: { text: '서울특별시 강남구 테헤란로 123' },
          },
        },
        {
          placePrediction: {
            placeId: 'place_id_2',
            text: { text: '서울특별시 강남구 강남대로 456' },
          },
        },
      ];

      const details1: GooglePlaceDetails = {
        formattedAddress: '서울특별시 강남구 테헤란로 123',
        location: { latitude: 37.5012345, longitude: 127.0398765 },
      };
      const details2: GooglePlaceDetails = {
        formattedAddress: '서울특별시 강남구 강남대로 456',
        location: { latitude: 37.5112345, longitude: 127.0498765 },
      };

      mockGooglePlacesClient.autocomplete.mockResolvedValue(suggestions);
      mockGooglePlacesClient.getDetails
        .mockResolvedValueOnce(details1)
        .mockResolvedValueOnce(details2);

      const result = await service.searchAddress({ query: '강남' });

      expect(result.addresses).toHaveLength(2);
      expect(result.addresses[0]).toMatchObject({
        address: '서울특별시 강남구 테헤란로 123',
        roadAddress: '서울특별시 강남구 테헤란로 123',
        latitude: '37.5012345',
        longitude: '127.0398765',
      });
      expect(result.meta.total_count).toBe(2);
    });
  });

  // =====================
  // searchWithGoogle — 일부 Details 실패 시 성공한 것만 반환
  // =====================
  describe('searchAddress → searchWithGoogle (일부 Details 실패)', () => {
    it('일부 getDetails 호출이 실패하면 성공한 결과만 반환한다', async () => {
      const suggestions: GooglePlacesAutocompleteSuggestion[] = [
        {
          placePrediction: {
            placeId: 'place_id_ok',
            text: { text: '서울특별시 강남구 테헤란로 123' },
          },
        },
        {
          placePrediction: {
            placeId: 'place_id_fail',
            text: { text: '존재하지 않는 주소' },
          },
        },
      ];

      const successDetails: GooglePlaceDetails = {
        formattedAddress: '서울특별시 강남구 테헤란로 123',
        location: { latitude: 37.5012345, longitude: 127.0398765 },
      };

      mockGooglePlacesClient.autocomplete.mockResolvedValue(suggestions);
      mockGooglePlacesClient.getDetails
        .mockResolvedValueOnce(successDetails)
        .mockRejectedValueOnce(new Error('Places API error'));

      const result = await service.searchAddress({ query: '강남' });

      expect(result.addresses).toHaveLength(1);
      expect(result.addresses[0].address).toBe('서울특별시 강남구 테헤란로 123');
    });
  });

  // =====================
  // searchWithGoogle — 결과 없음
  // =====================
  describe('searchAddress → searchWithGoogle (결과 없음)', () => {
    it('autocomplete 결과가 없으면 빈 주소 배열을 반환한다', async () => {
      mockGooglePlacesClient.autocomplete.mockResolvedValue([]);

      const result = await service.searchAddress({ query: '결과없는주소xyz' });

      expect(result.addresses).toHaveLength(0);
      expect(result.meta.total_count).toBe(0);
      expect(result.meta.is_end).toBe(true);
    });

    it('모든 제안에 placePrediction이 없으면 빈 주소 배열을 반환한다', async () => {
      const suggestions: GooglePlacesAutocompleteSuggestion[] = [
        { placePrediction: undefined },
        { placePrediction: undefined },
      ];

      mockGooglePlacesClient.autocomplete.mockResolvedValue(suggestions);

      const result = await service.searchAddress({ query: '결과없는주소xyz' });

      expect(result.addresses).toHaveLength(0);
      expect(result.meta.total_count).toBe(0);
    });
  });

  // =====================
  // mapToAddressResult — 위도/경도 없는 결과 → null
  // =====================
  describe('mapToAddressResult (via searchAddress)', () => {
    it('getDetails가 null location을 반환하면 해당 결과를 필터링한다', async () => {
      const suggestions: GooglePlacesAutocompleteSuggestion[] = [
        {
          placePrediction: {
            placeId: 'place_no_location',
            text: { text: '위치 없는 주소' },
          },
        },
      ];

      const detailsWithoutLocation: GooglePlaceDetails = {
        formattedAddress: '위치 없는 주소',
        location: undefined,
      };

      mockGooglePlacesClient.autocomplete.mockResolvedValue(suggestions);
      mockGooglePlacesClient.getDetails.mockResolvedValue(detailsWithoutLocation);

      const result = await service.searchAddress({ query: '테스트' });

      expect(result.addresses).toHaveLength(0);
    });

    it('getDetails가 null을 반환하면 해당 결과를 필터링한다', async () => {
      const suggestions: GooglePlacesAutocompleteSuggestion[] = [
        {
          placePrediction: {
            placeId: 'place_null',
            text: { text: 'null 반환 주소' },
          },
        },
      ];

      mockGooglePlacesClient.autocomplete.mockResolvedValue(suggestions);
      mockGooglePlacesClient.getDetails.mockResolvedValue(null);

      const result = await service.searchAddress({ query: '테스트' });

      expect(result.addresses).toHaveLength(0);
    });

    it('formattedAddress가 있으면 사용하고 없으면 prediction.text.text로 폴백한다', async () => {
      const suggestions: GooglePlacesAutocompleteSuggestion[] = [
        {
          placePrediction: {
            placeId: 'place_with_formatted',
            text: { text: '예측 텍스트 주소' },
          },
        },
        {
          placePrediction: {
            placeId: 'place_without_formatted',
            text: { text: '예측 텍스트 폴백 주소' },
          },
        },
      ];

      const detailsWithFormatted: GooglePlaceDetails = {
        formattedAddress: '서울특별시 강남구 테헤란로 123 (정형화된 주소)',
        location: { latitude: 37.5, longitude: 127.0 },
      };

      const detailsWithoutFormatted: GooglePlaceDetails = {
        // formattedAddress 없음
        location: { latitude: 37.6, longitude: 127.1 },
      };

      mockGooglePlacesClient.autocomplete.mockResolvedValue(suggestions);
      mockGooglePlacesClient.getDetails
        .mockResolvedValueOnce(detailsWithFormatted)
        .mockResolvedValueOnce(detailsWithoutFormatted);

      const result = await service.searchAddress({ query: '테스트' });

      expect(result.addresses[0].address).toBe('서울특별시 강남구 테헤란로 123 (정형화된 주소)');
      expect(result.addresses[1].address).toBe('예측 텍스트 폴백 주소');
    });
  });
});
