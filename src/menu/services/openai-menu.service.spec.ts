import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { OpenAiMenuService } from './openai-menu.service';
import { TwoStageMenuService } from './two-stage-menu.service';
import { createMockService } from '../../../test/utils/test-helpers';

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
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should log service activation message', () => {
      // Spy on Logger prototype before creating instance
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      const freshService = new OpenAiMenuService(mockTwoStageMenuService);

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
        recommendations: ['김치찌개', '된장찌개', '순두부찌개'],
        reason: '한식을 좋아하시는 것 같아 추천드립니다.',
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
      ).toHaveBeenCalledWith(prompt, likes, dislikes, analysis);
    });

    it('should pass all parameters to TwoStageMenuService', async () => {
      mockTwoStageMenuService.generateMenuRecommendations.mockResolvedValue({
        recommendations: ['김치찌개'],
        reason: '추천 이유',
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
      ).toHaveBeenCalledWith(prompt, likes, dislikes, analysis);
    });

    it('should work without analysis parameter', async () => {
      const expectedResult = {
        recommendations: ['김치찌개'],
        reason: '추천 이유',
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
      ).toHaveBeenCalledWith(prompt, likes, dislikes, undefined);
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
        recommendations: ['김치찌개'],
        reason: '추천 이유',
      };

      mockTwoStageMenuService.generateMenuRecommendations.mockResolvedValue(
        expectedResult,
      );

      const result = await service.generateMenuRecommendations(prompt, [], []);

      expect(result).toEqual(expectedResult);
      expect(
        mockTwoStageMenuService.generateMenuRecommendations,
      ).toHaveBeenCalledWith(prompt, [], [], undefined);
    });
  });
});
