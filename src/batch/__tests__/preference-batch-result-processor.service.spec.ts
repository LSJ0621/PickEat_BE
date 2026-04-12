import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { User } from '@/user/entities/user.entity';
import { UserTasteAnalysis } from '@/user/entities/user-taste-analysis.entity';
import { UserService } from '@/user/user.service';
import { BATCH_CONFIG } from '@/common/constants/business.constants';
import { PreferenceBatchResultProcessorService } from '../services/preference-batch-result-processor.service';
import { BatchJob } from '../entities/batch-job.entity';

describe('PreferenceBatchResultProcessorService', () => {
  let service: PreferenceBatchResultProcessorService;

  let mockMenuSelectionRepository: {
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockUserService: { findOne: jest.Mock };
  let mockManager: {
    update: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: typeof mockManager;
  };
  let mockDataSource: { createQueryRunner: jest.Mock };

  const batchJob = { id: 10 } as BatchJob;

  beforeEach(async () => {
    mockMenuSelectionRepository = {
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(),
    };
    mockUserService = { findOne: jest.fn() };
    mockManager = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity, data) => data),
    };
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: mockManager,
    };
    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceBatchResultProcessorService,
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();

    service = module.get(PreferenceBatchResultProcessorService);
  });

  const makeUser = (overrides: Partial<User> = {}): User =>
    ({
      id: 1,
      preferences: {
        likes: ['pizza'],
        dislikes: ['cilantro'],
        analysis: 'old',
        structuredAnalysis: null,
        lastAnalyzedAt: null,
        analysisVersion: 2,
      },
      ...overrides,
    }) as unknown as User;

  const validContent = JSON.stringify({
    analysis: '  신규 분석 결과  ',
    stablePatterns: { pattern: 'spicy' },
    recentSignals: { signal: 'ramen' },
    diversityHints: { hint: 'balance' },
    compactSummary: '  요약  ',
    analysisParagraphs: ['paragraph 1'],
  });

  describe('parseCustomId', () => {
    it('정상 `pref_{userId}_{ids}` 형식을 파싱한다', () => {
      expect(service.parseCustomId('pref_42_1,2,3')).toEqual({
        userId: 42,
        selectionIds: [1, 2, 3],
      });
    });

    it('userId가 NaN이면 null을 반환한다', () => {
      expect(service.parseCustomId('pref_abc_1,2')).toBeNull();
    });

    it('selectionIds 중 일부 NaN이면 null을 반환한다', () => {
      expect(service.parseCustomId('pref_1_1,abc,3')).toBeNull();
    });

    it('형식 자체가 맞지 않으면 null을 반환한다', () => {
      expect(service.parseCustomId('invalid')).toBeNull();
      expect(service.parseCustomId('user_1_1,2')).toBeNull();
      expect(service.parseCustomId('pref_1')).toBeNull();
    });
  });

  describe('processResults — 정상 처리', () => {
    it('성공 결과를 User.preferences 업데이트 + UserTasteAnalysis upsert + Selection SUCCEEDED로 전이한다', async () => {
      mockUserService.findOne.mockResolvedValue(makeUser());
      mockManager.findOne.mockResolvedValue(null);

      const results = new Map<string, string>([['pref_1_10,11', validContent]]);
      await service.processResults(results, batchJob);

      // User update with preferences
      expect(mockManager.update).toHaveBeenCalledWith(
        User,
        { id: 1 },
        expect.objectContaining({
          preferences: expect.objectContaining({
            analysis: '신규 분석 결과',
            analysisVersion: 3,
            lastAnalyzedAt: expect.any(String),
            likes: ['pizza'],
            dislikes: ['cilantro'],
          }),
        }),
      );

      // new taste analysis saved (analysisVersion=1)
      expect(mockManager.save).toHaveBeenCalledWith(
        UserTasteAnalysis,
        expect.objectContaining({
          userId: 1,
          analysisVersion: 1,
          compactSummary: '요약',
        }),
      );

      // selection succeeded
      expect(mockManager.update).toHaveBeenCalledWith(
        MenuSelection,
        { id: In([10, 11]) },
        { status: MenuSelectionStatus.SUCCEEDED },
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('기존 UserTasteAnalysis가 있으면 update를 호출하고 analysisVersion을 증가시킨다', async () => {
      mockUserService.findOne.mockResolvedValue(makeUser());
      mockManager.findOne.mockResolvedValue({ id: 77, analysisVersion: 4 });

      const results = new Map<string, string>([['pref_1_10', validContent]]);
      await service.processResults(results, batchJob);

      expect(mockManager.update).toHaveBeenCalledWith(
        UserTasteAnalysis,
        { id: 77 },
        expect.objectContaining({ analysisVersion: 5 }),
      );
      expect(mockManager.save).not.toHaveBeenCalled();
    });

    it('preferences가 없는 사용자도 defaultUserPreferences로 초기화하여 처리한다', async () => {
      mockUserService.findOne.mockResolvedValue(
        makeUser({ preferences: undefined as never }),
      );
      mockManager.findOne.mockResolvedValue(null);

      const results = new Map<string, string>([['pref_1_10', validContent]]);
      await service.processResults(results, batchJob);

      expect(mockManager.update).toHaveBeenCalledWith(
        User,
        { id: 1 },
        expect.objectContaining({
          preferences: expect.objectContaining({ analysisVersion: 1 }),
        }),
      );
    });
  });

  describe('processResults — 실패/혼재', () => {
    it('JSON.parse 실패 항목은 실패 카운트 처리되고 transaction 시작조차 하지 않는다', async () => {
      mockUserService.findOne.mockResolvedValue(makeUser());
      mockManager.findOne.mockResolvedValue(null);

      const results = new Map<string, string>([
        ['pref_1_10', 'not-json{'],
        ['pref_2_20', validContent],
      ]);
      await service.processResults(results, batchJob);

      // Only one successful transaction commit
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      // JSON.parse 실패 시 parsed가 있으므로 markSelectionsFailedByIds가 한 번 호출됨
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([10], {
        status: MenuSelectionStatus.FAILED,
      });
    });

    it('response.analysis 누락 시 해당 selectionIds를 FAILED로 마킹한다', async () => {
      mockUserService.findOne.mockResolvedValue(makeUser());
      const badContent = JSON.stringify({ foo: 'bar' });
      const results = new Map<string, string>([['pref_1_10,11', badContent]]);

      await service.processResults(results, batchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [10, 11],
        { status: MenuSelectionStatus.FAILED },
      );
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('response.analysis가 string이 아니면 실패 처리한다', async () => {
      const badContent = JSON.stringify({ analysis: 123 });
      const results = new Map<string, string>([['pref_1_10', badContent]]);

      await service.processResults(results, batchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([10], {
        status: MenuSelectionStatus.FAILED,
      });
    });

    it('customId 정규식 미매칭 시 failCount만 증가하고 Selection 업데이트는 없다', async () => {
      const results = new Map<string, string>([['INVALID_ID', validContent]]);
      await service.processResults(results, batchJob);

      expect(mockManager.update).not.toHaveBeenCalled();
      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('processResults — User 미존재 / 트랜잭션 롤백', () => {
    it('userService.findOne이 throw하면 markSelectionsFailedByIds 후 다음 항목 계속', async () => {
      mockUserService.findOne
        .mockRejectedValueOnce(new Error('user not found'))
        .mockResolvedValueOnce(makeUser({ id: 2 }));
      mockManager.findOne.mockResolvedValue(null);

      const results = new Map<string, string>([
        ['pref_1_10', validContent],
        ['pref_2_20', validContent],
      ]);
      await service.processResults(results, batchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([10], {
        status: MenuSelectionStatus.FAILED,
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('manager.update 중 예외 → rollbackTransaction + markSelectionsFailedByIds + release', async () => {
      mockUserService.findOne.mockResolvedValue(makeUser());
      mockManager.update.mockRejectedValueOnce(new Error('db error'));

      const results = new Map<string, string>([['pref_1_10', validContent]]);
      await service.processResults(results, batchJob);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([10], {
        status: MenuSelectionStatus.FAILED,
      });
    });

    it('markSelectionsFailedByIds 자체가 예외여도 에러 로깅 후 다음 항목 계속', async () => {
      mockUserService.findOne.mockResolvedValue(makeUser());
      mockManager.update.mockRejectedValueOnce(new Error('db error'));
      mockMenuSelectionRepository.update.mockRejectedValueOnce(
        new Error('mark fail error'),
      );

      const errorSpy = jest
        .spyOn((service as unknown as { logger: { error: jest.Mock } }).logger, 'error')
        .mockImplementation(() => undefined);

      const results = new Map<string, string>([['pref_1_10', validContent]]);
      await expect(service.processResults(results, batchJob)).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('processResults — 청크 처리', () => {
    it('RESULT_CHUNK_SIZE 단위로 `Processing chunk N/M` 로그를 남긴다', async () => {
      mockUserService.findOne.mockResolvedValue(makeUser());
      mockManager.findOne.mockResolvedValue(null);

      const total = BATCH_CONFIG.RESULT_CHUNK_SIZE + 5;
      const entries: [string, string][] = [];
      for (let i = 0; i < total; i++) {
        entries.push([`pref_1_${i + 1}`, validContent]);
      }
      const results = new Map(entries);

      const logSpy = jest
        .spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log')
        .mockImplementation(() => undefined);

      await service.processResults(results, batchJob);

      const chunkLogs = logSpy.mock.calls.filter((call) =>
        String(call[0]).startsWith('Processing chunk'),
      );
      expect(chunkLogs.length).toBe(2);
      expect(String(chunkLogs[0][0])).toContain('Processing chunk 1/2');
      expect(String(chunkLogs[1][0])).toContain('Processing chunk 2/2');
    });
  });

  describe('processErrors', () => {
    it('각 BatchError의 customId를 파싱해 markSelectionsFailedByIds를 호출한다', async () => {
      const errors = [
        { customId: 'pref_1_10,11', code: 'ERR', message: 'x' },
        { customId: 'pref_2_20', code: 'ERR2', message: 'y' },
      ];

      await service.processErrors(errors, batchJob);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(
        [10, 11],
        { status: MenuSelectionStatus.FAILED },
      );
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([20], {
        status: MenuSelectionStatus.FAILED,
      });
    });

    it('customId 파싱 실패 항목은 skip된다', async () => {
      const errors = [{ customId: 'INVALID', code: 'ERR', message: 'x' }];

      await service.processErrors(errors, batchJob);

      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('mark/increment 헬퍼', () => {
    it('markSelectionsBatchProcessing — 빈 배열은 update 호출 없음', async () => {
      await service.markSelectionsBatchProcessing([], 1);
      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();
    });

    it('markSelectionsBatchProcessing — status + batchJobId 설정', async () => {
      const selections = [{ id: 1 }, { id: 2 }] as MenuSelection[];
      await service.markSelectionsBatchProcessing(selections, 99);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([1, 2], {
        status: MenuSelectionStatus.BATCH_PROCESSING,
        batchJobId: 99,
      });
    });

    it('markSelectionsSucceeded — 빈 배열 호출 없음 / 정상 SUCCEEDED 업데이트', async () => {
      await service.markSelectionsSucceeded([]);
      expect(mockMenuSelectionRepository.update).not.toHaveBeenCalled();

      await service.markSelectionsSucceeded([{ id: 5 }] as MenuSelection[]);
      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith([5], {
        status: MenuSelectionStatus.SUCCEEDED,
      });
    });

    it('incrementRetryCount — 빈 배열은 createQueryBuilder 호출 없음', async () => {
      await service.incrementRetryCount([]);
      expect(mockMenuSelectionRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('incrementRetryCount — 정상 호출 시 raw `retryCount + 1` update 실행', async () => {
      const execute = jest.fn().mockResolvedValue(undefined);
      const whereInIds = jest.fn().mockReturnValue({ execute });
      const set = jest.fn().mockReturnValue({ whereInIds });
      const update = jest.fn().mockReturnValue({ set });
      mockMenuSelectionRepository.createQueryBuilder.mockReturnValue({ update });

      await service.incrementRetryCount([{ id: 3 }, { id: 4 }] as MenuSelection[]);

      expect(update).toHaveBeenCalledWith(MenuSelection);
      expect(set).toHaveBeenCalledWith({ retryCount: expect.any(Function) });
      const rawFn = set.mock.calls[0][0].retryCount as () => string;
      expect(rawFn()).toBe('"retryCount" + 1');
      expect(whereInIds).toHaveBeenCalledWith([3, 4]);
      expect(execute).toHaveBeenCalled();
    });
  });
});
