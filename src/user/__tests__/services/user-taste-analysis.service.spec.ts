import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserTasteAnalysisService } from '@/user/services/user-taste-analysis.service';
import { UserTasteAnalysis } from '@/user/entities/user-taste-analysis.entity';
import { UserTasteAnalysisData } from '@/user/interfaces/user-taste-analysis.interface';

describe('UserTasteAnalysisService', () => {
  let service: UserTasteAnalysisService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    upsert: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UserTasteAnalysisService,
        {
          provide: getRepositoryToken(UserTasteAnalysis),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = moduleRef.get<UserTasteAnalysisService>(UserTasteAnalysisService);
  });

  const buildData = (overrides: Partial<UserTasteAnalysisData> = {}): UserTasteAnalysisData => ({
    stablePatterns: {
      categories: ['한식'],
      flavors: ['매운맛'],
      cookingMethods: ['국물'],
      confidence: 'medium',
    },
    recentSignals: { trending: ['김치찌개'], declining: [] },
    diversityHints: { explorationAreas: ['양식'], rotationSuggestions: [] },
    compactSummary: '요약',
    analysisParagraphs: {
      paragraph1: 'p1',
      paragraph2: 'p2',
      paragraph3: 'p3',
    },
    ...overrides,
  });

  // ─── getByUserId ─────────────────────────────────────────────────────────

  describe('getByUserId', () => {
    it('userId로 조회한 결과를 반환한다', async () => {
      const record = { userId: 1 } as UserTasteAnalysis;
      mockRepository.findOne.mockResolvedValue(record);

      const result = await service.getByUserId(1);

      expect(result).toBe(record);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { userId: 1 } });
    });

    it('레코드가 없으면 null을 반환한다', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getByUserId(99);

      expect(result).toBeNull();
    });
  });

  // ─── upsert ──────────────────────────────────────────────────────────────

  describe('upsert', () => {
    it('레코드가 없으면 새로 생성하고 analysisVersion=1로 저장한다', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockImplementation((x) => x);
      mockRepository.save.mockImplementation((x) => Promise.resolve(x));

      const data = buildData();
      const result = await service.upsert(1, data);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, analysisVersion: 1 }),
      );
      expect(mockRepository.save).toHaveBeenCalled();
      expect((result as UserTasteAnalysis & { analysisVersion: number }).analysisVersion).toBe(1);
    });

    it('변경 사항이 없으면 기존 레코드를 그대로 반환하고 save를 호출하지 않는다', async () => {
      const existing = {
        userId: 1,
        analysisVersion: 3,
        ...buildData(),
      } as unknown as UserTasteAnalysis;
      mockRepository.findOne.mockResolvedValue(existing);

      const result = await service.upsert(1, buildData());

      expect(result).toBe(existing);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('stablePatterns가 달라지면 analysisVersion을 증가시킨다', async () => {
      const existing = {
        userId: 1,
        analysisVersion: 3,
        ...buildData(),
      } as unknown as UserTasteAnalysis;
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockImplementation((x) => Promise.resolve(x));

      const updated = buildData({
        stablePatterns: {
          categories: ['양식'],
          flavors: ['단맛'],
          cookingMethods: ['구이'],
          confidence: 'high',
        },
      });
      const result = (await service.upsert(1, updated)) as UserTasteAnalysis & {
        analysisVersion: number;
      };

      expect(result.analysisVersion).toBe(4);
      expect(mockRepository.save).toHaveBeenCalledWith(existing);
    });

    it('compactSummary가 달라지면 analysisVersion을 증가시킨다', async () => {
      const existing = {
        userId: 1,
        analysisVersion: 1,
        ...buildData(),
      } as unknown as UserTasteAnalysis;
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockImplementation((x) => Promise.resolve(x));

      const updated = buildData({ compactSummary: '다른 요약' });
      const result = (await service.upsert(1, updated)) as UserTasteAnalysis & {
        analysisVersion: number;
      };

      expect(result.analysisVersion).toBe(2);
    });

    it('analysisVersion이 undefined인 기존 레코드는 1로 증가한다', async () => {
      const existing = {
        userId: 1,
        ...buildData(),
      } as unknown as UserTasteAnalysis;
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockImplementation((x) => Promise.resolve(x));

      const updated = buildData({ compactSummary: '변경' });
      const result = (await service.upsert(1, updated)) as UserTasteAnalysis & {
        analysisVersion: number;
      };

      expect(result.analysisVersion).toBe(1);
    });
  });

  // ─── bulkUpsert ──────────────────────────────────────────────────────────

  describe('bulkUpsert', () => {
    it('빈 배열이면 repository.upsert를 호출하지 않는다', async () => {
      await service.bulkUpsert([]);

      expect(mockRepository.upsert).not.toHaveBeenCalled();
    });

    it('items를 매핑하여 단일 upsert 호출로 처리한다', async () => {
      mockRepository.upsert.mockResolvedValue(undefined);

      await service.bulkUpsert([
        { userId: 1, data: buildData() },
        { userId: 2, data: buildData({ compactSummary: '요약2' }) },
      ]);

      expect(mockRepository.upsert).toHaveBeenCalledTimes(1);
      const [values, options] = mockRepository.upsert.mock.calls[0];
      expect(values).toHaveLength(2);
      expect(values[0].userId).toBe(1);
      expect(values[1].userId).toBe(2);
      expect(options.conflictPaths).toEqual(['userId']);
    });

    it('data의 선택 필드가 undefined면 null로 변환한다', async () => {
      mockRepository.upsert.mockResolvedValue(undefined);

      await service.bulkUpsert([
        {
          userId: 1,
          data: {
            stablePatterns: undefined,
            recentSignals: undefined,
            diversityHints: undefined,
            compactSummary: undefined,
            analysisParagraphs: undefined,
          } as unknown as UserTasteAnalysisData,
        },
      ]);

      const [values] = mockRepository.upsert.mock.calls[0];
      expect(values[0].stablePatterns).toBeNull();
      expect(values[0].recentSignals).toBeNull();
      expect(values[0].compactSummary).toBeNull();
    });
  });
});
