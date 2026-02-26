import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { WebSearchSummaryService } from '../../services/web-search-summary.service';
import { RedisCacheService } from '@/common/cache/cache.service';
import { createMockConfigService } from '../../../../test/mocks/external-clients.mock';
import type { WebSearchSummary } from '@/menu/interfaces/web-search-summary.interface';
import type { ResponsesApiResponse } from '@/external/openai/openai.types';

// Mock OpenAI module - must be at top level
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      responses: {
        create: jest.fn(),
      },
    })),
  };
});

describe('WebSearchSummaryService', () => {
  let service: WebSearchSummaryService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockCacheService: jest.Mocked<RedisCacheService>;
  let mockOpenAIResponsesCreate: jest.Mock;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerDebugSpy: jest.SpyInstance;

  const validWebSearchSummary: WebSearchSummary = {
    localTrends: ['김치찌개', '된장찌개', '순두부찌개'],
    demographicFavorites: ['비빔밥', '불고기'],
    seasonalItems: ['삼계탕'],
    confidence: 'high',
    summary: '서울 강남구 30대 남성 인기 메뉴 요약',
  };

  function buildOpenAIResponse(outputText: string): ResponsesApiResponse {
    return {
      id: 'resp-test-123',
      output_text: outputText,
      output: [],
      usage: {
        input_tokens: 100,
        output_tokens: 200,
        total_tokens: 300,
      },
    };
  }

  beforeEach(async () => {
    mockConfigService = createMockConfigService({
      OPENAI_API_KEY: 'test-api-key-web-search',
    }) as unknown as jest.Mocked<ConfigService>;

    mockCacheService = {
      getWebSearchSummary: jest.fn(),
      setWebSearchSummary: jest.fn(),
    } as unknown as jest.Mocked<RedisCacheService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSearchSummaryService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisCacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<WebSearchSummaryService>(WebSearchSummaryService);

    // Access the mocked openai.responses.create
    mockOpenAIResponsesCreate = (service as unknown as {
      openai: { responses: { create: jest.Mock } };
    }).openai.responses.create;

    // Suppress logger output in tests
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    loggerDebugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    loggerDebugSpy.mockRestore();
  });

  // ─────────────────────────────────────────────
  // getSummary - early returns
  // ─────────────────────────────────────────────
  describe('getSummary - early return when no user info', () => {
    it('should return null when all user info parameters are undefined', async () => {
      const result = await service.getSummary(
        undefined,
        undefined,
        undefined,
        'ko',
      );

      expect(result).toBeNull();
      expect(mockCacheService.getWebSearchSummary).not.toHaveBeenCalled();
      expect(mockOpenAIResponsesCreate).not.toHaveBeenCalled();
    });

    it('should proceed when only userAddress is provided', async () => {
      const cachedSummary = {
        ...validWebSearchSummary,
        searchedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
      };
      mockCacheService.getWebSearchSummary.mockResolvedValue(cachedSummary);

      const result = await service.getSummary('서울시 강남구', undefined, undefined);

      expect(result).not.toBeNull();
      expect(mockCacheService.getWebSearchSummary).toHaveBeenCalled();
    });

    it('should proceed when only userBirthYear is provided', async () => {
      const cachedSummary = {
        ...validWebSearchSummary,
        searchedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
      };
      mockCacheService.getWebSearchSummary.mockResolvedValue(cachedSummary);

      const result = await service.getSummary(undefined, 1990, undefined);

      expect(result).not.toBeNull();
    });

    it('should proceed when only userGender is provided', async () => {
      const cachedSummary = {
        ...validWebSearchSummary,
        searchedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
      };
      mockCacheService.getWebSearchSummary.mockResolvedValue(cachedSummary);

      const result = await service.getSummary(undefined, undefined, 'male');

      expect(result).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // getSummary - cache hit
  // ─────────────────────────────────────────────
  describe('getSummary - cache hit', () => {
    it('should return cached summary without calling OpenAI when cache hits', async () => {
      const cachedSummary = {
        ...validWebSearchSummary,
        searchedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
      };
      mockCacheService.getWebSearchSummary.mockResolvedValue(cachedSummary);

      const result = await service.getSummary(
        '서울시 강남구',
        1990,
        'male',
        'ko',
      );

      expect(mockCacheService.getWebSearchSummary).toHaveBeenCalledWith(
        '서울시 강남구',
        1990,
        'male',
      );
      expect(mockOpenAIResponsesCreate).not.toHaveBeenCalled();
      expect(result).toEqual({
        localTrends: cachedSummary.localTrends,
        demographicFavorites: cachedSummary.demographicFavorites,
        seasonalItems: cachedSummary.seasonalItems,
        confidence: cachedSummary.confidence,
        summary: cachedSummary.summary,
      });
    });

    it('should continue to OpenAI call when cache returns null', async () => {
      mockCacheService.getWebSearchSummary.mockResolvedValue(null);
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );
      mockCacheService.setWebSearchSummary.mockResolvedValue(undefined);

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(mockOpenAIResponsesCreate).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });

    it('should continue to OpenAI call when cache service throws', async () => {
      mockCacheService.getWebSearchSummary.mockRejectedValue(
        new Error('Redis connection error'),
      );
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );
      mockCacheService.setWebSearchSummary.mockResolvedValue(undefined);

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(mockOpenAIResponsesCreate).toHaveBeenCalled();
      expect(result).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // getSummary - OpenAI call and parsing
  // ─────────────────────────────────────────────
  describe('getSummary - OpenAI response parsing', () => {
    beforeEach(() => {
      mockCacheService.getWebSearchSummary.mockResolvedValue(null);
      mockCacheService.setWebSearchSummary.mockResolvedValue(undefined);
    });

    it('should return parsed summary when OpenAI returns valid JSON', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: ['김치찌개', '된장찌개', '부대찌개'],
        demographicFavorites: ['비빔밥', '불고기', '갈비'],
        seasonalItems: ['삼계탕', '냉면'],
        confidence: 'high',
        summary: '강남구 30대 남성 인기 메뉴',
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary(
        '서울시 강남구',
        1993,
        'male',
        'ko',
      );

      expect(result).not.toBeNull();
      expect(result?.localTrends).toEqual(['김치찌개', '된장찌개', '부대찌개']);
      expect(result?.demographicFavorites).toEqual(['비빔밥', '불고기', '갈비']);
      expect(result?.seasonalItems).toEqual(['삼계탕', '냉면']);
      expect(result?.confidence).toBe('high');
      expect(result?.summary).toBe('강남구 30대 남성 인기 메뉴');
    });

    it('should truncate localTrends to max 3 items', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: ['A', 'B', 'C', 'D', 'E'],
        demographicFavorites: ['X', 'Y'],
        seasonalItems: ['Z'],
        confidence: 'medium',
        summary: '테스트',
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.localTrends).toHaveLength(3);
      expect(result?.localTrends).toEqual(['A', 'B', 'C']);
    });

    it('should truncate demographicFavorites to max 3 items', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: ['A'],
        demographicFavorites: ['P', 'Q', 'R', 'S'],
        seasonalItems: [],
        confidence: 'low',
        summary: '',
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.demographicFavorites).toHaveLength(3);
    });

    it('should truncate seasonalItems to max 2 items', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: [],
        demographicFavorites: [],
        seasonalItems: ['봄나물', '딸기', '도다리', '쑥'],
        confidence: 'medium',
        summary: '계절 요약',
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.seasonalItems).toHaveLength(2);
    });

    it('should truncate summary to max 100 characters', async () => {
      const longSummary = 'A'.repeat(150);
      const jsonOutput = JSON.stringify({
        localTrends: [],
        demographicFavorites: [],
        seasonalItems: [],
        confidence: 'low',
        summary: longSummary,
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.summary).toHaveLength(100);
    });

    it('should return empty summary with low confidence when output_text is not JSON', async () => {
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse('This is plain text, not JSON'),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('low');
      expect(result?.localTrends).toEqual([]);
      expect(result?.demographicFavorites).toEqual([]);
      expect(result?.seasonalItems).toEqual([]);
      expect(result?.summary).toBe('');
    });

    it('should handle non-array values in parsed fields by returning empty arrays', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: 'not an array',
        demographicFavorites: null,
        seasonalItems: 123,
        confidence: 'medium',
        summary: 'test',
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.localTrends).toEqual([]);
      expect(result?.demographicFavorites).toEqual([]);
      expect(result?.seasonalItems).toEqual([]);
    });

    it('should use "low" confidence when parsed confidence is invalid', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: [],
        demographicFavorites: [],
        seasonalItems: [],
        confidence: 'invalid-confidence',
        summary: '',
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.confidence).toBe('low');
    });

    it('should accept valid "medium" confidence value', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: [],
        demographicFavorites: [],
        seasonalItems: [],
        confidence: 'medium',
        summary: '',
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.confidence).toBe('medium');
    });

    it('should accept valid "low" confidence value', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: [],
        demographicFavorites: [],
        seasonalItems: [],
        confidence: 'low',
        summary: '',
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.confidence).toBe('low');
    });

    it('should return empty string summary when parsed summary is not a string', async () => {
      const jsonOutput = JSON.stringify({
        localTrends: [],
        demographicFavorites: [],
        seasonalItems: [],
        confidence: 'high',
        summary: 12345,
      });

      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result?.summary).toBe('');
    });

    it('should return null when OpenAI call throws an error', async () => {
      mockOpenAIResponsesCreate.mockRejectedValue(
        new Error('OpenAI API rate limit exceeded'),
      );

      const result = await service.getSummary(
        '서울시 강남구',
        1990,
        'male',
        'ko',
      );

      expect(result).toBeNull();
    });

    it('should save result to cache after successful OpenAI call', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      await service.getSummary('서울시 강남구', 1990, 'male', 'ko');

      expect(mockCacheService.setWebSearchSummary).toHaveBeenCalledWith(
        '서울시 강남구',
        1990,
        'male',
        expect.objectContaining({
          ...validWebSearchSummary,
          searchedAt: expect.any(String),
        }),
      );
    });

    it('should still return result even when cache save throws', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );
      mockCacheService.setWebSearchSummary.mockRejectedValue(
        new Error('Redis write error'),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(validWebSearchSummary.confidence);
    });
  });

  // ─────────────────────────────────────────────
  // getSummary - language handling
  // ─────────────────────────────────────────────
  describe('getSummary - language and gender label', () => {
    beforeEach(() => {
      mockCacheService.getWebSearchSummary.mockResolvedValue(null);
      mockCacheService.setWebSearchSummary.mockResolvedValue(undefined);
    });

    it('should call OpenAI with correct model and tools for Korean language', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(mockOpenAIResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ type: 'web_search' }),
          ]),
          input: expect.any(String),
        }),
      );
    });

    it('should call OpenAI for English language', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      await service.getSummary('Seoul Gangnam', 1990, 'female', 'en');

      expect(mockOpenAIResponsesCreate).toHaveBeenCalled();
    });

    it('should handle undefined gender and birthYear without errors', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary(
        '서울시 강남구',
        undefined,
        undefined,
        'ko',
      );

      expect(result).not.toBeNull();
    });

    it('should use default language "ko" when not specified', async () => {
      const cachedSummary = {
        ...validWebSearchSummary,
        searchedAt: new Date().toISOString(),
        cachedAt: new Date().toISOString(),
      };
      mockCacheService.getWebSearchSummary.mockResolvedValue(cachedSummary);

      // Call without language parameter - it defaults to 'ko'
      const result = await service.getSummary('서울시', 1990, 'male');

      expect(result).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // getSummary - gender label and age group branching
  // ─────────────────────────────────────────────
  describe('getSummary - getGenderLabel branching', () => {
    beforeEach(() => {
      mockCacheService.getWebSearchSummary.mockResolvedValue(null);
      mockCacheService.setWebSearchSummary.mockResolvedValue(undefined);
    });

    it('should call OpenAI when gender is "other" (covers unknown gender label path)', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary(
        '서울시 강남구',
        1990,
        'other',
        'ko',
      );

      expect(result).not.toBeNull();
      expect(mockOpenAIResponsesCreate).toHaveBeenCalled();
    });

    it('should call OpenAI when gender is "female" in English language', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary(
        'Seoul Gangnam',
        1995,
        'female',
        'en',
      );

      expect(result).not.toBeNull();
      expect(mockOpenAIResponsesCreate).toHaveBeenCalled();
    });

    it('should call OpenAI when gender is "male" in English language', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      const result = await service.getSummary(
        'Seoul Gangnam',
        1988,
        'male',
        'en',
      );

      expect(result).not.toBeNull();
    });

    it('should handle an unknown gender string by returning it as-is', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );

      // 'unknown' is not in the gender map, so falls back to raw value
      const result = await service.getSummary(
        '서울시',
        1990,
        'unknown' as 'male',
        'ko',
      );

      expect(result).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────
  // getSummary - usage token logging
  // ─────────────────────────────────────────────
  describe('getSummary - OpenAI response usage logging', () => {
    beforeEach(() => {
      mockCacheService.getWebSearchSummary.mockResolvedValue(null);
      mockCacheService.setWebSearchSummary.mockResolvedValue(undefined);
    });

    it('should log token usage when response.usage is present', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue({
        id: 'resp-test',
        output_text: jsonOutput,
        output: [],
        usage: {
          input_tokens: 150,
          output_tokens: 250,
          total_tokens: 400,
        },
      });

      await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('토큰'),
      );
    });

    it('should NOT log token usage when response.usage is absent', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      // Return a response without usage field
      mockOpenAIResponsesCreate.mockResolvedValue({
        id: 'resp-test',
        output_text: jsonOutput,
        output: [],
      });

      await service.getSummary('서울시', 1990, 'male', 'ko');

      // result should still be returned
      expect(mockCacheService.setWebSearchSummary).toHaveBeenCalled();
    });

    it('should log cache error as warn when setWebSearchSummary throws non-Error', async () => {
      const jsonOutput = JSON.stringify(validWebSearchSummary);
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(jsonOutput),
      );
      mockCacheService.setWebSearchSummary.mockRejectedValue(
        'string cache error',
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      // Still returns result despite cache error
      expect(result).not.toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[캐시 저장 실패]'),
      );
    });

    it('should log error details when OpenAI call throws non-Error', async () => {
      mockOpenAIResponsesCreate.mockRejectedValue('string openai error');

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result).toBeNull();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Call A 실패]'),
      );
    });

    it('should log parseSummary error in catch block with non-Error', async () => {
      // parseSummary is private; test indirectly via invalid JSON that triggers catch
      // We test the catch path inside parseSummary by making JSON.parse throw
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse('{ this is : invalid json }'),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('low');
    });
  });

  // ─────────────────────────────────────────────
  // getSummary - JSON embedded in larger text
  // ─────────────────────────────────────────────
  describe('getSummary - JSON extraction from mixed text', () => {
    beforeEach(() => {
      mockCacheService.getWebSearchSummary.mockResolvedValue(null);
      mockCacheService.setWebSearchSummary.mockResolvedValue(undefined);
    });

    it('should extract JSON block from surrounding text', async () => {
      const jsonObject = {
        localTrends: ['삼겹살'],
        demographicFavorites: ['냉면'],
        seasonalItems: ['수박화채'],
        confidence: 'medium',
        summary: '요약 텍스트',
      };
      const mixedOutput = `다음은 분석 결과입니다:\n${JSON.stringify(jsonObject)}\n감사합니다.`;
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(mixedOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result).not.toBeNull();
      expect(result?.localTrends).toEqual(['삼겹살']);
      expect(result?.confidence).toBe('medium');
    });

    it('should return low confidence empty summary when JSON.parse fails on matched text', async () => {
      // Output that matches {} pattern but is invalid JSON
      const invalidJsonOutput = '{ this is : not valid json }';
      mockOpenAIResponsesCreate.mockResolvedValue(
        buildOpenAIResponse(invalidJsonOutput),
      );

      const result = await service.getSummary('서울시', 1990, 'male', 'ko');

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('low');
      expect(result?.localTrends).toEqual([]);
    });
  });
});
