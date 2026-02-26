import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Gpt4oMiniValidationService } from '../../services/gpt4o-mini-validation.service';
import { ExternalApiException } from '@/common/exceptions/external-api.exception';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';

describe('Gpt4oMiniValidationService', () => {
  let service: Gpt4oMiniValidationService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key',
      OPENAI_VALIDATION_MODEL: 'gpt-4o-mini-custom',
    }) as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Gpt4oMiniValidationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<Gpt4oMiniValidationService>(
      Gpt4oMiniValidationService,
    );

    // Mock OpenAI instance
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as unknown as jest.Mocked<OpenAI>;

    service['openai'] = mockOpenAI;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use OPENAI_VALIDATION_MODEL if configured', () => {
      expect(service['model']).toBe('gpt-4o-mini-custom');
    });

    it('should fallback to default gpt-4o-mini if not configured', () => {
      const defaultConfig = createMockConfigService({
        OPENAI_API_KEY: 'test-api-key',
      }) as unknown as jest.Mocked<ConfigService>;

      const defaultService = new Gpt4oMiniValidationService(defaultConfig);

      expect(defaultService['model']).toBe('gpt-4o-mini');
    });
  });

  describe('onModuleInit', () => {
    it('should initialize OpenAI client when API key is configured', () => {
      const freshService = new Gpt4oMiniValidationService(mockConfigService);

      const loggerSpy = jest.spyOn(freshService['logger'], 'log');

      freshService.onModuleInit();

      expect(mockConfigService.get).toHaveBeenCalledWith('OPENAI_API_KEY');
      expect(freshService['openai']).toBeDefined();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stage 1 validation service initialized'),
      );
    });

    it('should log error when API key is not configured', () => {
      const noKeyConfig = createMockConfigService(
        {},
      ) as unknown as jest.Mocked<ConfigService>;

      const freshService = new Gpt4oMiniValidationService(noKeyConfig);

      const loggerSpy = jest.spyOn(freshService['logger'], 'error');

      freshService.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith(
        'OPENAI_API_KEY is not configured',
      );
      expect(freshService['openai']).toBeUndefined();
    });
  });

  describe('validateMenuRequest', () => {
    const userPrompt = '오늘 점심 추천해줘';
    const likes = ['한식', '중식'];
    const dislikes = ['일식'];

    it('should throw ExternalApiException when OpenAI is not initialized', async () => {
      service['openai'] = null as unknown as OpenAI;

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should successfully validate menu request (isValid=true)', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식', '중식', '일식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.validateMenuRequest(
        userPrompt,
        likes,
        dislikes,
      );

      expect(result).toEqual({
        isValid: true,
        invalidReason: '',
        intent: 'preference',
        constraints: {
          budget: 'medium',
          dietary: [],
          urgency: 'normal',
        },
        suggestedCategories: ['한식', '중식', '일식'],
      });
    });

    it('should validate invalid menu request (isValid=false)', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: false,
                invalidReason: '음식과 관련 없는 요청입니다.',
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: [],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.validateMenuRequest(
        '날씨 알려줘',
        likes,
        dislikes,
      );

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe('음식과 관련 없는 요청입니다.');
    });

    it('should handle different intents', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 'mood',
                constraints: {
                  budget: 'high',
                  dietary: ['할랄'],
                  urgency: 'quick',
                },
                suggestedCategories: ['중식', '태국식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.validateMenuRequest(
        '매운 음식 먹고 싶어',
        likes,
        dislikes,
      );

      expect(result.intent).toBe('mood');
      expect(result.constraints.urgency).toBe('quick');
    });

    it('should throw ExternalApiException when no choices returned', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [],
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when content is empty', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should record failure metrics when OpenAI call fails', async () => {
      const error = new Error('OpenAI API error');
      mockOpenAI.chat.completions.create = jest.fn().mockRejectedValue(error);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should log validation success with intent', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 'location',
                constraints: {
                  budget: 'low',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.validateMenuRequest(userPrompt, likes, dislikes);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Stage 1 validation complete]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('isValid=true'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('intent=location'),
      );
    });

    it('should log validation error on failure', async () => {
      const error = new Error('Validation error');
      mockOpenAI.chat.completions.create = jest.fn().mockRejectedValue(error);

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Stage 1 validation failed]'),
      );
    });

    it('should handle usage with input_tokens and output_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 30,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.validateMenuRequest(
        userPrompt,
        likes,
        dislikes,
      );

      expect(result.isValid).toBe(true);
    });

    it('should handle usage with only total_tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          total_tokens: 80,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.validateMenuRequest(
        userPrompt,
        likes,
        dislikes,
      );

      expect(result.isValid).toBe(true);
    });

    it('should handle missing usage object', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.validateMenuRequest(
        userPrompt,
        likes,
        dislikes,
      );

      expect(result.isValid).toBe(true);
    });

    it('should handle usage with empty token fields (fallback to 0)', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {},
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.validateMenuRequest(
        userPrompt,
        likes,
        dislikes,
      );

      expect(result.isValid).toBe(true);
    });

    it('should handle non-Error instance in catch block', async () => {
      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockRejectedValue('string error');

      const loggerSpy = jest.spyOn(service['logger'], 'error');

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('string error'),
      );
    });

    it('should throw ExternalApiException when parsed response is not an object - null (line 161)', async () => {
      // GPT returns a JSON that is a primitive value (null), not an object
      const mockResponse = {
        id: 'chatcmpl-null',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              // JSON.parse('null') returns null → typeof null === 'object' but parsed === null
              content: 'null',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 1,
          total_tokens: 11,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when parsed response is a number primitive (line 161 - typeof !== object)', async () => {
      // JSON.parse('42') returns 42, which is typeof 'number' not 'object'
      const mockResponse = {
        id: 'chatcmpl-number',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '42',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 1,
          total_tokens: 11,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when isValid field is missing (line 171)', async () => {
      // isValid is missing from the response object
      const mockResponse = {
        id: 'chatcmpl-no-isvalid',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                // isValid is missing
                invalidReason: '',
                intent: 'preference',
                constraints: { budget: 'medium', dietary: [], urgency: 'normal' },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 20,
          total_tokens: 50,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when isValid is a string instead of boolean (line 171)', async () => {
      const mockResponse = {
        id: 'chatcmpl-string-isvalid',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: 'true', // string instead of boolean
                invalidReason: '',
                intent: 'preference',
                constraints: { budget: 'medium', dietary: [], urgency: 'normal' },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 20,
          total_tokens: 50,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when intent field is missing (line 178)', async () => {
      // intent is missing from the response object
      const mockResponse = {
        id: 'chatcmpl-no-intent',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                // intent is missing
                constraints: { budget: 'medium', dietary: [], urgency: 'normal' },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 20,
          total_tokens: 50,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should throw ExternalApiException when intent is a number instead of string (line 178)', async () => {
      const mockResponse = {
        id: 'chatcmpl-number-intent',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 42, // number instead of string
                constraints: { budget: 'medium', dietary: [], urgency: 'normal' },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 20,
          total_tokens: 50,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      await expect(
        service.validateMenuRequest(userPrompt, likes, dislikes),
      ).rejects.toThrow(ExternalApiException);
    });

    it('should handle non-finite total tokens', async () => {
      const mockResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                isValid: true,
                invalidReason: '',
                intent: 'preference',
                constraints: {
                  budget: 'medium',
                  dietary: [],
                  urgency: 'normal',
                },
                suggestedCategories: ['한식'],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: NaN,
        },
      };

      mockOpenAI.chat.completions.create = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const result = await service.validateMenuRequest(
        userPrompt,
        likes,
        dislikes,
      );

      expect(result.isValid).toBe(true);
    });
  });
});
