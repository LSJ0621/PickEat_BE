import { Test, TestingModule } from '@nestjs/testing';
import { TwoStageMenuService } from './two-stage-menu.service';
import { Gpt4oMiniValidationService } from '../gpt/gpt4o-mini-validation.service';
import { Gpt51MenuService } from '../gpt/gpt51-menu.service';
import { InvalidMenuRequestException } from '@/common/exceptions/invalid-menu-request.exception';
import { createMockService } from '../../../test/utils/test-helpers';

describe('TwoStageMenuService', () => {
  let service: TwoStageMenuService;
  let mockValidationService: jest.Mocked<Gpt4oMiniValidationService>;
  let mockMenuService: jest.Mocked<Gpt51MenuService>;

  beforeEach(async () => {
    mockValidationService = createMockService<Gpt4oMiniValidationService>([
      'validateMenuRequest',
    ]);

    mockMenuService = createMockService<Gpt51MenuService>([
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
        recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        reason: '한식을 좋아하시는 것 같아 추천드립니다.',
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
        recommendations: ['마라탕', '팟타이'],
        reason: '매운 음식을 좋아하시는 것 같아 추천드립니다.',
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
        recommendations: ['김밥', '떡볶이'],
        reason: '저렴하고 빠른 음식 추천드립니다.',
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
        recommendations: ['김치찌개', '마파두부', '라멘'],
        reason: '다양한 음식을 추천드립니다.',
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
        recommendations: ['김치찌개'],
        reason: '추천 이유',
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
        recommendations: ['김치찌개'],
        reason: '추천 이유',
      });

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.generateMenuRecommendations(prompt, likes, dislikes);

      expect(loggerSpy).toHaveBeenCalledWith('[Stage 1] 요청 검증 시작');
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
        recommendations: ['김치찌개'],
        reason: '추천 이유',
      });

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.generateMenuRecommendations(prompt, likes, dislikes);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Stage 1 success]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[Stage 2] Menu recommendation generation started',
        ),
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
        recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        reason: '추천 이유',
      };

      mockValidationService.validateMenuRequest.mockResolvedValue(
        validationResult,
      );
      mockMenuService.generateMenuRecommendations.mockResolvedValue(menuResult);

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.generateMenuRecommendations(prompt, likes, dislikes);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Stage 2 complete]'),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Recommendation count: 3'),
      );
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
        expect.stringContaining('[Stage 1 validation failed]'),
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
  });
});
