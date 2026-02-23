import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { OpenAiMenuService } from '../../services/openai-menu.service';
import { TwoStageMenuService } from '../../services/two-stage-menu.service';
import { createMockService } from '../../../../test/utils/test-helpers';

describe('OpenAiMenuService', () => {
  let service: OpenAiMenuService;
  let mockTwoStageMenuService: jest.Mocked<TwoStageMenuService>;

  beforeEach(async () => {
    mockTwoStageMenuService = createMockService<TwoStageMenuService>([
      'generateMenuRecommendations',
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiMenuService,
        {
          provide: TwoStageMenuService,
          useValue: mockTwoStageMenuService,
        },
      ],
    }).compile();

    service = module.get<OpenAiMenuService>(OpenAiMenuService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service instance with all dependencies injected', () => {
      expect(service).toBeDefined();
    });

    it('should log service activation message', () => {
      // Spy on Logger prototype before creating instance
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      new OpenAiMenuService(mockTwoStageMenuService);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Two-stage menu recommendation service active'),
      );

      logSpy.mockRestore();
    });
  });

  describe('generateMenuRecommendations', () => {
    const prompt = '오늘 점심 추천해줘';
    const likes = ['한식', '중식'];
    const dislikes = ['일식'];
    const analysis = '사용자는 매운 음식을 좋아합니다';

    it('should delegate to TwoStageMenuService', async () => {
      const expectedResult = {
        intro: '한식을 좋아하시는 것 같아 추천드립니다.',
        recommendations: [
          { condition: '조건1', menu: '김치찌개' },
          { condition: '조건2', menu: '된장찌개' },
          { condition: '조건3', menu: '순두부찌개' },
        ],
        closing: '맛있게 드세요!',
      };

      mockTwoStageMenuService.generateMenuRecommendations.mockResolvedValue(
        expectedResult,
      );

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );

      expect(result).toEqual(expectedResult);
      expect(
        mockTwoStageMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        analysis,
        'ko',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should pass all parameters to TwoStageMenuService', async () => {
      mockTwoStageMenuService.generateMenuRecommendations.mockResolvedValue({
        intro: '추천 이유',
        recommendations: [{ condition: '조건', menu: '김치찌개' }],
        closing: '마무리',
      });

      await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
        analysis,
      );

      expect(
        mockTwoStageMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockTwoStageMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        analysis,
        'ko',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should work without analysis parameter', async () => {
      const expectedResult = {
        intro: '추천 이유',
        recommendations: [{ condition: '조건', menu: '김치찌개' }],
        closing: '마무리',
      };

      mockTwoStageMenuService.generateMenuRecommendations.mockResolvedValue(
        expectedResult,
      );

      const result = await service.generateMenuRecommendations(
        prompt,
        likes,
        dislikes,
      );

      expect(result).toEqual(expectedResult);
      expect(
        mockTwoStageMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        likes,
        dislikes,
        undefined,
        'ko',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should propagate errors from TwoStageMenuService', async () => {
      const error = new Error('Two-stage menu service error');
      mockTwoStageMenuService.generateMenuRecommendations.mockRejectedValue(
        error,
      );

      await expect(
        service.generateMenuRecommendations(prompt, likes, dislikes),
      ).rejects.toThrow('Two-stage menu service error');
    });

    it('should handle empty likes and dislikes arrays', async () => {
      const expectedResult = {
        intro: '추천 이유',
        recommendations: [{ condition: '조건', menu: '김치찌개' }],
        closing: '마무리',
      };

      mockTwoStageMenuService.generateMenuRecommendations.mockResolvedValue(
        expectedResult,
      );

      const result = await service.generateMenuRecommendations(prompt, [], []);

      expect(result).toEqual(expectedResult);
      expect(
        mockTwoStageMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(
        prompt,
        [],
        [],
        undefined,
        'ko',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });
});
