import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { OpenAiPlacesService } from '../../services/openai-places.service';

// Mock retry to avoid delays
jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('OpenAiPlacesService', () => {
  let service: OpenAiPlacesService;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        if (key === 'OPENAI_PLACES_MODEL') return 'gpt-test';
        if (key === 'OPENAI_MODEL') return 'gpt-test';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new OpenAiPlacesService(mockConfig);
    service.onModuleInit();

    mockCreate = jest.fn();
    (service as unknown as { openai: { chat: { completions: { create: jest.Mock } } } }).openai = {
      chat: { completions: { create: mockCreate } },
    };
  });

  describe('recommendFromGooglePlaces', () => {
    it('빈 candidates이면 빈 recommendations를 반환한다', async () => {
      const result = await service.recommendFromGooglePlaces('김치찌개', []);

      expect(result).toEqual({ recommendations: [] });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('openai가 초기화되지 않으면 ExternalApiException을 throw한다', async () => {
      (service as unknown as { openai: null }).openai = null;

      await expect(
        service.recommendFromGooglePlaces('김치찌개', [
          { id: 'p1', name: '맛집', rating: 4.5, userRatingCount: 100 },
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
                    placeId: 'p1',
                    name: '맛집',
                    reason: '맛있는 김치찌개로 유명',
                    score: 90,
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });

      const result = await service.recommendFromGooglePlaces(
        '김치찌개',
        [{ id: 'p1', name: '맛집', rating: 4.5, userRatingCount: 100 }],
      );

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].placeId).toBe('p1');
    });

    it('응답 content가 비어있으면 ExternalApiException을 throw한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 },
      });

      await expect(
        service.recommendFromGooglePlaces('test', [
          { id: 'p1', name: '맛집', rating: 4.5, userRatingCount: 100 },
        ]),
      ).rejects.toThrow(ExternalApiException);
    });

    it('잘못된 응답 형식이면 ExternalApiException을 throw한다', async () => {
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({ invalid: true }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      });

      await expect(
        service.recommendFromGooglePlaces('test', [
          { id: 'p1', name: '맛집', rating: 4.5, userRatingCount: 100 },
        ]),
      ).rejects.toThrow(ExternalApiException);
    });

    it('language가 지정되지 않으면 menuName에서 언어를 감지한다', async () => {
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

      const result = await service.recommendFromGooglePlaces(
        'chicken soup',
        [{ id: 'p1', name: 'Restaurant', rating: 4.0, userRatingCount: 50 }],
        'chicken soup',
      );

      expect(result.recommendations).toEqual([]);
    });

    it('API 호출이 실패하면 ExternalApiException을 throw한다', async () => {
      mockCreate.mockRejectedValue(new Error('API failure'));

      await expect(
        service.recommendFromGooglePlaces('test', [
          { id: 'p1', name: '맛집', rating: 4.5, userRatingCount: 100 },
        ]),
      ).rejects.toThrow(ExternalApiException);
    });
  });
});
