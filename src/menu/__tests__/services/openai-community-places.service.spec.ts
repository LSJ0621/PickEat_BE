import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAiCommunityPlacesService } from '../../services/openai-community-places.service';

// Mock retry to avoid delays
jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('OpenAiCommunityPlacesService', () => {
  let service: OpenAiCommunityPlacesService;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        if (key === 'OPENAI_MODEL') return 'gpt-test';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new OpenAiCommunityPlacesService(mockConfig);
    service.onModuleInit();

    mockCreate = jest.fn();
    (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
      chat: { completions: { create: mockCreate } },
    };
  });

  describe('recommendFromCommunityPlaces', () => {
    it('빈 candidates이면 빈 recommendations를 반환한다', async () => {
      const result = await service.recommendFromCommunityPlaces('김치찌개', []);

      expect(result).toEqual({ recommendations: [] });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('openai가 초기화되지 않으면 ExternalApiException을 throw한다', async () => {
      (service as unknown as { openai: null }).openai = null;

      await expect(
        service.recommendFromCommunityPlaces('김치찌개', [
          { id: 1, name: '커뮤니티 맛집', address: '서울', menuTypes: ['한식'], category: '한식', description: null, distance: 100 },
        ]),
      ).rejects.toThrow(ExternalApiException);
    });

    it('정상 응답 시 recommendations를 반환한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                recommendations: [
                  {
                    userPlaceId: 1,
                    name: '커뮤니티 맛집',
                    address: '서울',
                    matchReason: '지역 주민 추천',
                    matchReasonTags: ['한식'],
                    matchScore: 85,
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const result = await service.recommendFromCommunityPlaces(
        '김치찌개',
        [{ id: 1, name: '커뮤니티 맛집', address: '서울', menuTypes: ['한식'], category: '한식', description: null, distance: 100 }],
      );

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].userPlaceId).toBe(1);
    });

    it('응답 content가 비어있으면 ExternalApiException을 throw한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      });

      await expect(
        service.recommendFromCommunityPlaces('test', [
          { id: 1, name: '맛집', address: '서울', menuTypes: ['한식'], category: '한식', description: null, distance: 100 },
        ]),
      ).rejects.toThrow(ExternalApiException);
    });

    it('잘못된 응답 형식이면 ExternalApiException을 throw한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ wrongField: true }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      await expect(
        service.recommendFromCommunityPlaces('test', [
          { id: 1, name: '맛집', address: '서울', menuTypes: ['한식'], category: '한식', description: null, distance: 100 },
        ]),
      ).rejects.toThrow(ExternalApiException);
    });

    it('en 언어로 요청할 수 있다', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ recommendations: [] }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      const result = await service.recommendFromCommunityPlaces(
        'chicken soup',
        [{ id: 1, name: 'Restaurant', address: 'Seoul', menuTypes: ['Western'], category: 'Western', description: null, distance: 50 }],
        'en',
      );

      expect(result.recommendations).toEqual([]);
    });

    it('API 호출 실패 시 ExternalApiException을 throw한다', async () => {
      mockCreate.mockRejectedValue(new Error('API failure'));

      await expect(
        service.recommendFromCommunityPlaces('test', [
          { id: 1, name: '맛집', address: '서울', menuTypes: ['한식'], category: '한식', description: null, distance: 100 },
        ]),
      ).rejects.toThrow(ExternalApiException);
    });
  });
});
