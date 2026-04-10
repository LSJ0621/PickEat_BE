import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { GooglePlacesClient } from '@/external/google/clients/google-places.client';
import {
  createMockHttpService,
  createMockConfigService,
  createAxiosResponse,
  mockGooglePlacesResponses,
} from '../../../../test/mocks/external-clients.mock';

jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('GooglePlacesClient', () => {
  let client: GooglePlacesClient;
  let mockHttpService: ReturnType<typeof createMockHttpService>;

  beforeEach(async () => {
    mockHttpService = createMockHttpService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlacesClient,
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            GOOGLE_API_KEY: 'test-google-api-key',
            APP_URL: 'https://test.pickeat.com',
          }),
        },
      ],
    }).compile();

    client = module.get<GooglePlacesClient>(GooglePlacesClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('자동완성 API 응답을 파싱해 제안 목록을 반환한다', async () => {
    const autocompleteResponse = {
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
            text: { text: '강남역, 서울특별시 강남구' },
            structuredFormat: {
              mainText: { text: '강남역' },
              secondaryText: { text: '서울특별시 강남구' },
            },
          },
        },
      ],
    };

    mockHttpService.post.mockReturnValue(
      of(createAxiosResponse(autocompleteResponse)),
    );

    const result = await client.autocomplete('강남역');

    expect(result).toHaveLength(1);
    expect(result[0].placePrediction?.placeId).toBe(
      'ChIJN1t_tDeuEmsRUsoyG83frY4',
    );
    expect(result[0].placePrediction?.text.text).toBe('강남역, 서울특별시 강남구');
  });

  it('장소 상세 조회 API 응답을 파싱해 상세 정보를 반환한다', async () => {
    mockHttpService.get.mockReturnValue(
      of(createAxiosResponse(mockGooglePlacesResponses.placeDetailsSuccess)),
    );

    const result = await client.getDetails('ChIJN1t_tDeuEmsRUsoyG83frY4');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
    expect(result?.displayName?.text).toBe('맛있는 식당');
    expect(result?.rating).toBe(4.5);
    expect(result?.reviews).toHaveLength(1);
  });

  it('검색 결과가 없으면 빈 배열을 반환한다', async () => {
    mockHttpService.post.mockReturnValue(
      of(createAxiosResponse({ places: [] })),
    );

    const result = await client.searchByText('존재하지않는음식점');

    expect(result).toEqual([]);
  });
});
