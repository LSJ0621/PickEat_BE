import { ConfigService } from '@nestjs/config';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { Gpt4oMiniValidationService } from '@/menu/services/gpt4o-mini-validation.service';

// Mock retry util to avoid delays
jest.mock('@/common/utils/retry.util', () => ({
  retryWithExponentialBackoff: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

describe('Gpt4oMiniValidationService', () => {
  let service: Gpt4oMiniValidationService;
  const mockConfig = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_API_KEY') return 'test-key';
      if (key === 'OPENAI_VALIDATION_MODEL') return 'gpt-4o-mini';
      return undefined;
    }),
  } as unknown as ConfigService;

  const setMockOpenAI = (svc: Gpt4oMiniValidationService, createMock: jest.Mock) => {
    (svc as unknown as {
      openai: { chat: { completions: { create: jest.Mock } } };
    }).openai = { chat: { completions: { create: createMock } } };
  };

  beforeEach(() => {
    service = new Gpt4oMiniValidationService(mockConfig);
    service.onModuleInit();
  });

  it('OPENAI_API_KEY가 없으면 openai를 초기화하지 않고 호출 시 ExternalApiException을 던진다', async () => {
    const noKeyConfig = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const svc = new Gpt4oMiniValidationService(noKeyConfig);
    svc.onModuleInit();

    await expect(
      svc.validateMenuRequest('오늘 뭐 먹지?', [], []),
    ).rejects.toThrow(ExternalApiException);
  });

  it('정상 응답을 파싱하여 ValidationResponse를 반환한다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              isValid: true,
              invalidReason: '',
              intent: 'menu_recommendation',
              constraints: { budget: 'high', dietary: ['vegetarian'], urgency: 'urgent' },
              suggestedCategories: ['한식'],
            }),
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    setMockOpenAI(service, createMock);

    const result = await service.validateMenuRequest('김치찌개 먹고 싶어', [], []);

    expect(result.isValid).toBe(true);
    expect(result.intent).toBe('menu_recommendation');
    expect(result.constraints.budget).toBe('high');
    expect(result.constraints.dietary).toEqual(['vegetarian']);
    expect(result.suggestedCategories).toEqual(['한식']);
  });

  it('constraints가 없으면 기본값으로 채운다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ isValid: true, intent: 'menu_recommendation' }),
          },
          finish_reason: 'stop',
        },
      ],
    });
    setMockOpenAI(service, createMock);

    const result = await service.validateMenuRequest('test', [], []);

    expect(result.constraints.budget).toBe('medium');
    expect(result.constraints.dietary).toEqual([]);
    expect(result.constraints.urgency).toBe('normal');
    expect(result.suggestedCategories).toEqual([]);
  });

  it('isValid 필드가 없으면 ExternalApiException으로 래핑되어 throw된다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [
        {
          message: { content: JSON.stringify({ intent: 'menu_recommendation' }) },
          finish_reason: 'stop',
        },
      ],
    });
    setMockOpenAI(service, createMock);

    await expect(service.validateMenuRequest('test', [], [])).rejects.toThrow(
      ExternalApiException,
    );
  });

  it('choices가 비어있으면 ExternalApiException으로 래핑되어 throw된다', async () => {
    const createMock = jest.fn().mockResolvedValue({ choices: [] });
    setMockOpenAI(service, createMock);

    await expect(service.validateMenuRequest('test', [], [])).rejects.toThrow(
      ExternalApiException,
    );
  });

  it('content가 null이면 ExternalApiException으로 래핑되어 throw된다', async () => {
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: null }, finish_reason: 'stop' }],
    });
    setMockOpenAI(service, createMock);

    await expect(service.validateMenuRequest('test', [], [])).rejects.toThrow(
      ExternalApiException,
    );
  });
});
