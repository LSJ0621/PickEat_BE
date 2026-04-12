import { ConfigService } from '@nestjs/config';
import { WebSearchSummaryService } from '@/menu/services/web-search-summary.service';
import { RedisCacheService } from '@/common/cache/cache.service';

describe('WebSearchSummaryService', () => {
  let service: WebSearchSummaryService;
  const mockConfig = {
    getOrThrow: jest.fn().mockReturnValue('test-api-key'),
  } as unknown as ConfigService;

  const mockCache = {
    getWebSearchSummary: jest.fn(),
    setWebSearchSummary: jest.fn(),
  } as unknown as RedisCacheService;

  const setMockOpenAI = (svc: WebSearchSummaryService, createMock: jest.Mock) => {
    (svc as unknown as {
      openai: { responses: { create: jest.Mock } };
    }).openai = { responses: { create: createMock } };
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new WebSearchSummaryService(mockConfig, mockCache);
  });

  it('주소/생년/성별이 모두 없으면 null을 반환하고 OpenAI를 호출하지 않는다', async () => {
    const createMock = jest.fn();
    setMockOpenAI(service, createMock);

    const result = await service.getSummary(undefined, undefined, undefined, 'ko');

    expect(result).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('캐시 HIT 시 캐시된 요약을 반환하고 OpenAI를 호출하지 않는다', async () => {
    (mockCache.getWebSearchSummary as jest.Mock).mockResolvedValue({
      localTrends: ['트렌드1'],
      demographicFavorites: ['인기1'],
      seasonalItems: ['계절1'],
      confidence: 'high',
      summary: '요약',
    });
    const createMock = jest.fn();
    setMockOpenAI(service, createMock);

    const result = await service.getSummary('서울', 1990, 'male', 'ko');

    expect(result?.confidence).toBe('high');
    expect(result?.localTrends).toEqual(['트렌드1']);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('캐시 MISS 시 OpenAI를 호출하고 결과를 파싱/캐시 저장한다', async () => {
    (mockCache.getWebSearchSummary as jest.Mock).mockResolvedValue(null);
    (mockCache.setWebSearchSummary as jest.Mock).mockResolvedValue(undefined);

    const apiJson = {
      localTrends: ['t1', 't2'],
      demographicFavorites: ['d1'],
      seasonalItems: ['s1'],
      confidence: 'medium',
      summary: '짧은 요약',
    };
    const createMock = jest.fn().mockResolvedValue({
      output_text: JSON.stringify(apiJson),
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    setMockOpenAI(service, createMock);

    const result = await service.getSummary('서울', 1990, 'female', 'ko');

    expect(result?.confidence).toBe('medium');
    expect(result?.localTrends).toEqual(['t1', 't2']);
    expect(mockCache.setWebSearchSummary).toHaveBeenCalled();
  });

  it('OpenAI 응답이 JSON이 아니면 low confidence 빈 요약을 반환한다', async () => {
    (mockCache.getWebSearchSummary as jest.Mock).mockResolvedValue(null);
    const createMock = jest.fn().mockResolvedValue({
      output_text: 'not a json response',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    setMockOpenAI(service, createMock);

    const result = await service.getSummary('서울', undefined, undefined, 'ko');

    expect(result?.confidence).toBe('low');
    expect(result?.localTrends).toEqual([]);
  });

  it('OpenAI 호출이 실패하면 null을 반환한다', async () => {
    (mockCache.getWebSearchSummary as jest.Mock).mockResolvedValue(null);
    const createMock = jest.fn().mockRejectedValue(new Error('API down'));
    setMockOpenAI(service, createMock);

    const result = await service.getSummary('서울', 1990, 'male', 'ko');

    expect(result).toBeNull();
  });

  it('confidence가 유효하지 않은 값이면 low로 정규화된다', async () => {
    (mockCache.getWebSearchSummary as jest.Mock).mockResolvedValue(null);
    const createMock = jest.fn().mockResolvedValue({
      output_text: JSON.stringify({
        localTrends: [],
        demographicFavorites: [],
        seasonalItems: [],
        confidence: 'very-high',
        summary: '',
      }),
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    setMockOpenAI(service, createMock);

    const result = await service.getSummary('서울', undefined, undefined, 'ko');

    expect(result?.confidence).toBe('low');
  });
});
