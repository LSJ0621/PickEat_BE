import { Test, TestingModule } from '@nestjs/testing';
import { TwoStageMenuService } from '../../services/two-stage-menu.service';
import { Gpt4oMiniValidationService } from '../../services/gpt4o-mini-validation.service';
import { Gpt51MenuService } from '../../services/gpt51-menu.service';
import { GptWebSearchMenuService } from '../../services/gpt-web-search-menu.service';
import { InvalidMenuRequestException } from '@/common/exceptions/invalid-menu-request.exception';
import { createMockService } from '../../../../test/utils/test-helpers';

describe('TwoStageMenuService', () => {
  let service: TwoStageMenuService;
  let mockValidationService: jest.Mocked<Gpt4oMiniValidationService>;
  let mockMenuService: jest.Mocked<Gpt51MenuService>;
  let mockGptWebSearchMenuService: jest.Mocked<GptWebSearchMenuService>;

  beforeEach(async () => {
    mockValidationService = createMockService<Gpt4oMiniValidationService>([
      'validateMenuRequest',
    ]);

    mockMenuService = createMockService<Gpt51MenuService>([
      'generateMenuRecommendations',
    ]);

    mockGptWebSearchMenuService = createMockService<GptWebSearchMenuService>([
      'generateMenuRecommendations',
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoStageMenuService,
        {
          provide: Gpt4oMiniValidationService,
          useValue: mockValidationService,
        },
        {
          provide: Gpt51MenuService,
          useValue: mockMenuService,
        },
        {
          provide: GptWebSearchMenuService,
          useValue: mockGptWebSearchMenuService,
        },
      ],
    }).compile();

    service = module.get<TwoStageMenuService>(TwoStageMenuService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined and log initialization', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateMenuRecommendations', () => {
    const prompt = '오늘 점심 추천해줘';
    const likes = ['한식', '중식'];
    const dislikes = ['일식'];
    const analysis = '사용자는 매운 음식을 좋아합니다';

    it('should successfully complete two-stage recommendation (Stage 1 + Stage 2)', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식', '중식', '일식'],
      };

      const menuResult = {
        intro: '한식을 좋아하시는 것 같아 추천드립니다.',
        recommendations: [
          { condition: '조건1', menu: '김치찌개' },
          { condition: '조건2', menu: '된장찌개' },
          { condition: '조건3', menu: '순두부찌개' },
        ],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );

      expect(result).toEqual(menuResult);
      expect(mockValidationService.validateMenuRequest).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        'ko',
      );
      expect(mockMenuService.generateMenuRecommendations).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        analysis,
        {
          intent: 'preference',
          constraints: {
            budget: 'medium',
            dietary: [],
            urgency: 'normal',
          },
          suggestedCategories: ['한식', '중식', '일식'],
        },
        'ko',
        undefined,
        undefined,
      );
    });

    it('should throw InvalidMenuRequestException when Stage 1 validation fails', async () => {
      const validationResult = {
        isValid: false,
        invalidReason: '음식과 관련 없는 요청입니다.',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: [],
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes, analysis),
      ).rejects.toThrow(InvalidMenuRequestException);

      expect(mockValidationService.validateMenuRequest).toHaveBeenCalled();
      expect(
        mockMenuService.generateMenuRecommendations,
      ).not.toHaveBeenCalled();
    });

    it('should handle different validation intents', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'mood' as const,
        constraints: {
          budget: 'high' as const,
          dietary: ['할랄'],
          urgency: 'quick' as const,
        },
        suggestedCategories: ['중식', '태국식'],
      };

      const menuResult = {
        intro: '매운 음식을 좋아하시는 것 같아 추천드립니다.',
        recommendations: [
          { condition: '조건1', menu: '마라탕' },
          { condition: '조건2', menu: '팟타이' },
        ],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const result = await service.generateMenuRecommendations(
        '매운 음식 먹고 싶어',
        likes,
        dislikes,
      );

      expect(result).toEqual(menuResult);
      expect(mockMenuService.generateMenuRecommendations).toHaveBeenCalledWith(
        '매운 음식 먹고 싶어',
        likes,
        dislikes,
        undefined,
        {
          intent: 'mood',
          constraints: {
            budget: 'high',
            dietary: ['할랄'],
            urgency: 'quick',
          },
          suggestedCategories: ['중식', '태국식'],
        },
        'ko',
        undefined,
        undefined,
      );
    });

    it('should handle location-based intent', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'location' as const,
        constraints: {
          budget: 'low' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식', '분식'],
      };

      const menuResult = {
        intro: '저렴하고 빠른 음식 추천드립니다.',
        recommendations: [
          { condition: '조건1', menu: '김밥' },
          { condition: '조건2', menu: '떡볶이' },
        ],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const result = await service.generateMenuRecommendations(
        '강남역 근처에서 빠르게 먹을 수 있는 거',
        likes,
        dislikes,
      );

      expect(result).toEqual(menuResult);
    });

    it('should handle mixed intent', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'mixed' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식', '중식', '일식'],
      };

      const menuResult = {
        intro: '다양한 음식을 추천드립니다.',
        recommendations: [
          { condition: '조건1', menu: '김치찌개' },
          { condition: '조건2', menu: '마파두부' },
          { condition: '조건3', menu: '라멘' },
        ],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const result = await service.generateMenuRecommendations(
        '뭐 먹을까',
        likes,
        dislikes,
      );

      expect(result).toEqual(menuResult);
    });

    it('should work without analysis parameter', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식'],
      };

      const menuResult = {
        intro: '추천 이유',
        recommendations: [{ condition: '조건', menu: '김치찌개' }],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toEqual(menuResult);
      expect(mockMenuService.generateMenuRecommendations).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        undefined,
        expect.any(Object),
        'ko',
        undefined,
        undefined,
      );
    });

    it('should log Stage 1 validation start', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식'],
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue({
        intro: '추천 이유',
        recommendations: [{ condition: '조건', menu: '김치찌개' }],
        closing: '맛있게 드세요!',
      });

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.generateMenuRecommendations(prompt, likes, dislikes);

      expect(loggerSpy).toHaveBeenCalledWith(
        '[Stage 1: 검증 시작] GPT-4o-mini',
      );
    });

    it('should log Stage 1 success and Stage 2 start', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식', '중식'],
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue({
        intro: '추천 이유',
        recommendations: [{ condition: '조건', menu: '김치찌개' }],
        closing: '맛있게 드세요!',
      });

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.generateMenuRecommendations(prompt, likes, dislikes);

      expect(loggerSpy).toHaveBeenCalledWith('[Stage 1: 검증 완료]');
      expect(loggerSpy).toHaveBeenCalledWith(
        '[Stage 2: 추천 시작] GPT-5.1 + web_search',
      );
    });

    it('should log Stage 2 completion with recommendation count', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식'],
      };

      const menuResult = {
        intro: '추천 이유',
        recommendations: [
          { condition: '조건1', menu: '김치찌개' },
          { condition: '조건2', menu: '된장찌개' },
          { condition: '조건3', menu: '순두부찌개' },
        ],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.generateMenuRecommendations(prompt, likes, dislikes);

      expect(loggerSpy).toHaveBeenCalledWith('[Stage 2: 추천 완료]');
    });

    it('should log warning when Stage 1 validation fails', async () => {
      const validationResult = {
        isValid: false,
        invalidReason: '음식과 관련 없는 요청입니다.',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: [],
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );

      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      await expect(
        service.generateMenuRecommendations('날씨 알려줘', likes, dislikes),
      ).rejects.toThrow(InvalidMenuRequestException);

      expect(loggerSpy).toHaveBeenCalledWith(
        '[Stage 1 validation failed] reason=음식과 관련 없는 요청입니다.',
      );
    });

    it('should propagate errors from Stage 1 validation service', async () => {
      const error = new Error('Validation service error');
      mockValidationService.validateMenuRequest.mockRejectedValue(error);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow('Validation service error');
    });

    it('should propagate errors from Stage 2 menu service', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식'],
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );

      const error = new Error('Menu generation error');
      mockMenuService.generateMenuRecommendations.mockRejectedValue(error);

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow('Menu generation error');
    });

    it('should use default constraints when validationResult.constraints is undefined', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: undefined,
        suggestedCategories: ['한식'],
      };

      const menuResult = {
        intro: '추천 이유',
        recommendations: [{ condition: '조건', menu: '김치찌개' }],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult as any,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );

      expect(result).toEqual(menuResult);
      expect(mockMenuService.generateMenuRecommendations).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        analysis,
        {
          intent: 'preference',
          constraints: {
            budget: 'medium',
            dietary: [],
            urgency: 'normal',
          },
          suggestedCategories: ['한식'],
        },
        'ko',
        undefined,
        undefined,
      );
    });

    it('should use empty array when validationResult.suggestedCategories is undefined', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'high' as const,
          dietary: ['채식'],
          urgency: 'quick' as const,
        },
        suggestedCategories: undefined,
      };

      const menuResult = {
        intro: '채식 메뉴 추천',
        recommendations: [{ condition: '조건', menu: '샐러드' }],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult as any,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toEqual(menuResult);
      expect(mockMenuService.generateMenuRecommendations).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        undefined,
        {
          intent: 'preference',
          constraints: {
            budget: 'high',
            dietary: ['채식'],
            urgency: 'quick',
          },
          suggestedCategories: [],
        },
        'ko',
        undefined,
        undefined,
      );
    });

    it('should log user profile when userBirthYear or userGender is provided (line 92) and use web search path (line 99)', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식'],
      };

      const menuResult = {
        intro: '추천 이유',
        recommendations: [{ condition: '조건', menu: '비빔밥' }],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockGptWebSearchMenuService.generateMenuRecommendations.mockResolvedValue(
        menuResult,
      );

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
        'ko',
        '서울시 강남구', // userAddress
        1990, // userBirthYear (triggers line 92 logging)
        'female', // userGender (triggers line 92 logging)
      );

      expect(result).toEqual(menuResult);
      // line 92: userBirthYear || userGender → logs profile message
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('사용자 프로필: 제공됨'),
      );
      // line 99: userAddress || userBirthYear || userGender → uses gptWebSearchMenuService
      expect(
        mockGptWebSearchMenuService.generateMenuRecommendations,
      ).toHaveBeenCalled();
      expect(
        mockMenuService.generateMenuRecommendations,
      ).not.toHaveBeenCalled();
    });

    it('should use web search path when only userBirthYear is provided (line 99)', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식'],
      };

      const menuResult = {
        intro: '추천',
        recommendations: [{ condition: '조건', menu: '김치찌개' }],
        closing: '맛있게!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockGptWebSearchMenuService.generateMenuRecommendations.mockResolvedValue(
        menuResult,
      );

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        undefined,
        'ko',
        undefined, // no userAddress
        1985, // only userBirthYear → triggers web search but not "프로필 제공됨" alone
        undefined, // no userGender
      );

      expect(result).toEqual(menuResult);
      // userBirthYear alone satisfies (userAddress || userBirthYear || userGender) at line 99
      expect(
        mockGptWebSearchMenuService.generateMenuRecommendations,
      ).toHaveBeenCalled();
    });

    it('should use web search path when only userGender is provided (line 92 and 99)', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'preference' as const,
        constraints: {
          budget: 'medium' as const,
          dietary: [],
          urgency: 'normal' as const,
        },
        suggestedCategories: ['한식'],
      };

      const menuResult = {
        intro: '추천',
        recommendations: [{ condition: '조건', menu: '된장찌개' }],
        closing: '맛있게!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockGptWebSearchMenuService.generateMenuRecommendations.mockResolvedValue(
        menuResult,
      );

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        undefined,
        'ko',
        undefined, // no userAddress
        undefined, // no userBirthYear
        'male', // only userGender → triggers line 92 logging AND line 99 web search
      );

      expect(result).toEqual(menuResult);
      // line 92: userGender truthy → log profile
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('사용자 프로필: 제공됨'),
      );
      // line 99: userGender → web search
      expect(
        mockGptWebSearchMenuService.generateMenuRecommendations,
      ).toHaveBeenCalled();
    });

    it('should use both default constraints and empty array when both fields are undefined', async () => {
      const validationResult = {
        isValid: true,
        invalidReason: '',
        intent: 'mood' as const,
        constraints: undefined,
        suggestedCategories: undefined,
      };

      const menuResult = {
        intro: '다양한 메뉴 추천',
        recommendations: [
          { condition: '조건1', menu: '비빔밥' },
          { condition: '조건2', menu: '김치찌개' },
        ],
        closing: '맛있게 드세요!',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult as any,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toEqual(menuResult);
      expect(mockMenuService.generateMenuRecommendations).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        undefined,
        {
          intent: 'mood',
          constraints: {
            budget: 'medium',
            dietary: [],
            urgency: 'normal',
          },
          suggestedCategories: [],
        },
        'ko',
        undefined,
        undefined,
      );
    });
  });
});
