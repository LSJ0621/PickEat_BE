import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { PreferenceUpdateAiService } from '@/user/preference-update-ai.service';

jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('PreferenceUpdateAiService', () => {
  let service: PreferenceUpdateAiService;

  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_API_KEY') return 'test-key';
      if (key === 'OPENAI_PREFERENCE_MODEL') return 'gpt-preference-test';
      return undefined;
    }),
  } as unknown as ConfigService;

  const setMockOpenAI = (svc: PreferenceUpdateAiService, createMock: jest.Mock) => {
    (svc as unknown as {
      openai: { chat: { completions: { create: jest.Mock } } };
    }).openai = { chat: { completions: { create: createMock } } };
  };

  const buildSlotMenus = () => ({
    breakfast: ['토스트'],
    lunch: ['김치찌개'],
    dinner: ['삼겹살'],
    etc: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PreferenceUpdateAiService(mockConfig);
    service.onModuleInit();
  });

  it('OPENAI_API_KEY가 없으면 onModuleInit에서 openai가 null이 되고 호출 시 ExternalApiException을 던진다', async () => {
    const noKeyConfig = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const svc = new PreferenceUpdateAiService(noKeyConfig);
    svc.onModuleInit();

    await expect(
      svc.generatePreferenceAnalysis({ likes: [], dislikes: [] } as never, buildSlotMenus()),
    ).rejects.toThrow(ExternalApiException);
  });

  it('정상 응답 시 analysis 문자열을 trim하여 반환한다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ analysis: '  사용자 취향 요약  ' }) } },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    setMockOpenAI(service, createMock);

    const result = await service.generatePreferenceAnalysis(
      { likes: ['한식'], dislikes: ['매운맛'] } as never,
      buildSlotMenus(),
      'ko',
    );

    expect(result.analysis).toBe('사용자 취향 요약');
  });

  it('preferredLanguage=en일 때 OpenAI 호출은 정상적으로 진행된다 (언어 매핑 간접 검증)', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ analysis: 'English result' }) } }],
    });
    setMockOpenAI(service, createMock);

    const result = await service.generatePreferenceAnalysis(
      { likes: [], dislikes: [] } as never,
      buildSlotMenus(),
      'en',
    );

    expect(result.analysis).toBe('English result');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('preferredLanguage가 없어도 OpenAI 호출은 진행된다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ analysis: 'default' }) } }],
    });
    setMockOpenAI(service, createMock);

    await service.generatePreferenceAnalysis(
      { likes: [], dislikes: [] } as never,
      buildSlotMenus(),
    );

    expect(createMock).toHaveBeenCalled();
  });

  it('preferredLanguage가 임의 값("ja")이어도 ko로 폴백되어 정상 처리된다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ analysis: 'ko-fallback' }) } }],
    });
    setMockOpenAI(service, createMock);

    const result = await service.generatePreferenceAnalysis(
      { likes: [], dislikes: [] } as never,
      buildSlotMenus(),
      'ja',
    );

    expect(result.analysis).toBe('ko-fallback');
  });

  it('content가 없으면 ExternalApiException으로 래핑된다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: null } }],
    });
    setMockOpenAI(service, createMock);

    await expect(
      service.generatePreferenceAnalysis(
        { likes: [], dislikes: [] } as never,
        buildSlotMenus(),
      ),
    ).rejects.toThrow(ExternalApiException);
  });

  it('JSON 파싱 실패 시 ExternalApiException으로 래핑된다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'not-a-json' } }],
    });
    setMockOpenAI(service, createMock);

    await expect(
      service.generatePreferenceAnalysis(
        { likes: [], dislikes: [] } as never,
        buildSlotMenus(),
      ),
    ).rejects.toThrow(ExternalApiException);
  });

  it('analysis가 string이 아니면 ExternalApiException으로 래핑된다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ analysis: 123 }) } }],
    });
    setMockOpenAI(service, createMock);

    await expect(
      service.generatePreferenceAnalysis(
        { likes: [], dislikes: [] } as never,
        buildSlotMenus(),
      ),
    ).rejects.toThrow(ExternalApiException);
  });

  it('analysis가 빈 문자열이면 ExternalApiException으로 래핑된다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ analysis: '   ' }) } }],
    });
    setMockOpenAI(service, createMock);

    await expect(
      service.generatePreferenceAnalysis(
        { likes: [], dislikes: [] } as never,
        buildSlotMenus(),
      ),
    ).rejects.toThrow(ExternalApiException);
  });

  it('OpenAI API 호출 자체가 실패하면 ExternalApiException으로 래핑된다', async () => {
    const createMock = jest.fn().mockRejectedValue(new Error('Network error'));
    setMockOpenAI(service, createMock);

    await expect(
      service.generatePreferenceAnalysis(
        { likes: [], dislikes: [] } as never,
        buildSlotMenus(),
      ),
    ).rejects.toThrow(ExternalApiException);
  });
});
