import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PreferencesScheduler } from '../preferences.scheduler';
import { UserService } from '../../user/user.service';
import { PreferenceUpdateAiService } from '../../user/preference-update-ai.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '../entities/menu-selection.entity';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import {
  UserFactory,
  MenuSelectionFactory,
} from '../../../test/factories/entity.factory';

describe('PreferencesScheduler', () => {
  let scheduler: PreferencesScheduler;
  let mockMenuSelectionRepository: jest.Mocked<any>;
  let mockUserService: jest.Mocked<UserService>;
  let mockPreferenceUpdateAiService: jest.Mocked<PreferenceUpdateAiService>;

  beforeEach(async () => {
    mockMenuSelectionRepository = createMockRepository<MenuSelection>();
    mockUserService = {
      getEntityPreferences: jest.fn(),
      updateEntityPreferencesAnalysis: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    mockPreferenceUpdateAiService = {
      generatePreferenceAnalysis: jest.fn(),
    } as unknown as jest.Mocked<PreferenceUpdateAiService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesScheduler,
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: PreferenceUpdateAiService,
          useValue: mockPreferenceUpdateAiService,
        },
      ],
    }).compile();

    scheduler = module.get<PreferencesScheduler>(PreferencesScheduler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processPendingSelections', () => {
    it('should process pending selections and update preferences', async () => {
      const user1 = UserFactory.create({ id: 1 });
      const user2 = UserFactory.create({ id: 2 });

      const pendingSelections = [
        MenuSelectionFactory.create({
          id: 1,
          user: user1,
          status: MenuSelectionStatus.PENDING,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: ['된장찌개'],
            dinner: [],
            etc: [],
          },
        }),
        MenuSelectionFactory.create({
          id: 2,
          user: user2,
          status: MenuSelectionStatus.PENDING,
          menuPayload: {
            breakfast: [],
            lunch: ['비빔밥'],
            dinner: ['불고기'],
            etc: [],
          },
        }),
      ];

      const currentPreferences = {
        likes: ['한식'],
        dislikes: ['양식'],
        analysis: '매운 음식을 좋아함',
      };

      const aiResult = {
        analysis: '한식을 매우 좋아하며 특히 찌개류를 선호함',
      };

      mockMenuSelectionRepository.find.mockResolvedValue(pendingSelections);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue(
        currentPreferences,
      );
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        aiResult,
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        ...currentPreferences,
        analysis: aiResult.analysis,
      });

      await scheduler.processPendingSelections();

      expect(mockMenuSelectionRepository.find).toHaveBeenCalledWith({
        where: { status: MenuSelectionStatus.PENDING },
        relations: ['user'],
        order: { selectedAt: 'ASC' },
        take: 100,
      });

      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.IN_PROGRESS,
            lastTriedAt: expect.any(Date),
          }),
          expect.objectContaining({
            id: 2,
            status: MenuSelectionStatus.IN_PROGRESS,
            lastTriedAt: expect.any(Date),
          }),
        ]),
      );

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledTimes(2);
      expect(
        mockUserService.updateEntityPreferencesAnalysis,
      ).toHaveBeenCalledTimes(2);

      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.SUCCEEDED,
          }),
        ]),
      );
    });

    it('should skip processing when no pending selections exist', async () => {
      mockMenuSelectionRepository.find.mockResolvedValue([]);

      await scheduler.processPendingSelections();

      expect(mockMenuSelectionRepository.find).toHaveBeenCalled();
      expect(mockUserService.getEntityPreferences).not.toHaveBeenCalled();
    });

    it('should mark selections as SUCCEEDED when no menus exist', async () => {
      const user = UserFactory.create({ id: 1 });
      const emptySelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.PENDING,
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([emptySelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );

      await scheduler.processPendingSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).not.toHaveBeenCalled();
      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.SUCCEEDED,
          }),
        ]),
      );
    });

    it('should mark selections as FAILED when AI service fails', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.PENDING,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
        retryCount: 0,
      });

      mockMenuSelectionRepository.find.mockResolvedValue([selection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockRejectedValue(
        new Error('AI service failed'),
      );

      await scheduler.processPendingSelections();

      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.FAILED,
            retryCount: 1,
          }),
        ]),
      );
    });

    it('should group selections by user', async () => {
      const user = UserFactory.create({ id: 1 });
      const selections = [
        MenuSelectionFactory.create({
          id: 1,
          user,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        }),
        MenuSelectionFactory.create({
          id: 2,
          user,
          menuPayload: {
            breakfast: [],
            lunch: ['된장찌개'],
            dinner: [],
            etc: [],
          },
        }),
      ];

      mockMenuSelectionRepository.find.mockResolvedValue(selections);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '한식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '한식 선호',
      });

      await scheduler.processPendingSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: ['김치찌개'],
        lunch: ['된장찌개'],
        dinner: [],
        etc: [],
      });
    });

    it('should deduplicate menus within slots', async () => {
      const user = UserFactory.create({ id: 1 });
      const selections = [
        MenuSelectionFactory.create({
          id: 1,
          user,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        }),
        MenuSelectionFactory.create({
          id: 2,
          user,
          menuPayload: {
            breakfast: ['김치찌개', '된장찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        }),
      ];

      mockMenuSelectionRepository.find.mockResolvedValue(selections);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '한식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '한식 선호',
      });

      await scheduler.processPendingSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: ['김치찌개', '된장찌개'],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should process etc slot menus and filter empty names', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.PENDING,
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: ['떡볶이', '   ', '순대', ''],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([selection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '간식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '간식 선호',
      });

      await scheduler.processPendingSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: ['떡볶이', '순대'],
      });
    });

    it('should handle non-Error exceptions in top-level catch', async () => {
      mockMenuSelectionRepository.find.mockRejectedValue(
        'Database connection lost',
      );

      await scheduler.processPendingSelections();

      expect(mockUserService.getEntityPreferences).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions during preference update', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.PENDING,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
        retryCount: 0,
      });

      mockMenuSelectionRepository.find.mockResolvedValue([selection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockRejectedValue(
        'String error instead of Error object',
      );

      await scheduler.processPendingSelections();

      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.FAILED,
            retryCount: 1,
          }),
        ]),
      );
    });
  });

  describe('processFailedSelections', () => {
    it('should retry failed selections', async () => {
      const user = UserFactory.create({ id: 1 });
      const failedSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        retryCount: 1,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([failedSelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '한식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '한식 선호',
      });

      await scheduler.processFailedSelections();

      expect(mockMenuSelectionRepository.find).toHaveBeenCalledWith({
        where: { status: MenuSelectionStatus.FAILED },
        relations: ['user'],
        order: { selectedAt: 'ASC' },
        take: 100,
      });

      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.IN_PROGRESS,
          }),
        ]),
      );

      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.SUCCEEDED,
          }),
        ]),
      );
    });

    it('should increment retry count when retry fails', async () => {
      const user = UserFactory.create({ id: 1 });
      const failedSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        retryCount: 1,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([failedSelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockRejectedValue(
        new Error('AI failed again'),
      );

      await scheduler.processFailedSelections();

      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.FAILED,
            retryCount: 2,
          }),
        ]),
      );
    });

    it('should skip processing when no failed selections exist', async () => {
      mockMenuSelectionRepository.find.mockResolvedValue([]);

      await scheduler.processFailedSelections();

      expect(mockMenuSelectionRepository.find).toHaveBeenCalled();
      expect(mockUserService.getEntityPreferences).not.toHaveBeenCalled();
    });

    it('should mark selections as SUCCEEDED when no menus exist in failed retry', async () => {
      const user = UserFactory.create({ id: 1 });
      const emptySelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([emptySelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );

      await scheduler.processFailedSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).not.toHaveBeenCalled();
      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.SUCCEEDED,
          }),
        ]),
      );
    });

    it('should handle non-Error exceptions in failed retry', async () => {
      const user = UserFactory.create({ id: 1 });
      const failedSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([failedSelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockRejectedValue(
        'String error',
      );

      await scheduler.processFailedSelections();

      expect(mockMenuSelectionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.FAILED,
          }),
        ]),
      );
    });

    it('should handle top-level non-Error exceptions in processFailedSelections', async () => {
      mockMenuSelectionRepository.find.mockRejectedValue(
        'Database connection lost',
      );

      await scheduler.processFailedSelections();

      expect(mockUserService.getEntityPreferences).not.toHaveBeenCalled();
    });

    it('should process lunch slot menus in failed retry', async () => {
      const user = UserFactory.create({ id: 1 });
      const failedSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        menuPayload: {
          breakfast: [],
          lunch: ['비빔밥', '  '],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([failedSelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '한식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '한식 선호',
      });

      await scheduler.processFailedSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: [],
        lunch: ['비빔밥'],
        dinner: [],
        etc: [],
      });
    });

    it('should process dinner slot menus in failed retry', async () => {
      const user = UserFactory.create({ id: 1 });
      const failedSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: ['불고기', '   '],
          etc: [],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([failedSelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '한식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '한식 선호',
      });

      await scheduler.processFailedSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: [],
        lunch: [],
        dinner: ['불고기'],
        etc: [],
      });
    });

    it('should process etc slot menus in failed retry', async () => {
      const user = UserFactory.create({ id: 1 });
      const failedSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: ['떡볶이', '  ', '순대'],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([failedSelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '간식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '간식 선호',
      });

      await scheduler.processFailedSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: ['떡볶이', '순대'],
      });
    });
  });

  describe('edge cases', () => {
    it('should filter out all empty menu names after normalization across all slots', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.PENDING,
        menuPayload: {
          breakfast: ['김치찌개', '   ', ''],
          lunch: ['  ', ''],
          dinner: ['', '   '],
          etc: ['', '  '],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([selection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '한식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '한식 선호',
      });

      await scheduler.processPendingSelections();

      // Only 김치찌개 should remain after filtering empty strings
      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: ['김치찌개'],
        lunch: [],
        dinner: [],
        etc: [],
      });
    });

    it('should filter empty strings from all slots in processFailedSelections', async () => {
      const user = UserFactory.create({ id: 1 });
      const failedSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        menuPayload: {
          breakfast: ['', '  '],
          lunch: ['비빔밥', ''],
          dinner: ['   ', '불고기'],
          etc: ['', '떡볶이', '  '],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([failedSelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '다양한 한식 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '다양한 한식 선호',
      });

      await scheduler.processFailedSelections();

      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: [],
        lunch: ['비빔밥'],
        dinner: ['불고기'],
        etc: ['떡볶이'],
      });
    });

    it('should not increment retryCount when marking selections as SUCCEEDED', async () => {
      const user = UserFactory.create({ id: 1 });
      const pendingSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.PENDING,
        retryCount: 2,
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.find.mockResolvedValue([pendingSelection]);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );

      await scheduler.processPendingSelections();

      // Should be called twice: once for IN_PROGRESS, once for SUCCEEDED
      expect(mockMenuSelectionRepository.save).toHaveBeenCalledTimes(2);

      // Second call should mark as SUCCEEDED without incrementing retryCount
      expect(mockMenuSelectionRepository.save).toHaveBeenNthCalledWith(
        2,
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            status: MenuSelectionStatus.SUCCEEDED,
            retryCount: 2, // Should remain at 2, not incremented
          }),
        ]),
      );
    });

    it('should handle multiple selections from same user in groupByOwner', async () => {
      const user = UserFactory.create({ id: 1 });
      const selections = [
        MenuSelectionFactory.create({
          id: 1,
          user,
          status: MenuSelectionStatus.PENDING,
          menuPayload: {
            breakfast: ['아침메뉴1'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        }),
        MenuSelectionFactory.create({
          id: 2,
          user,
          status: MenuSelectionStatus.PENDING,
          menuPayload: {
            breakfast: [],
            lunch: ['점심메뉴1'],
            dinner: [],
            etc: [],
          },
        }),
        MenuSelectionFactory.create({
          id: 3,
          user,
          status: MenuSelectionStatus.PENDING,
          menuPayload: {
            breakfast: [],
            lunch: [],
            dinner: ['저녁메뉴1'],
            etc: [],
          },
        }),
      ];

      mockMenuSelectionRepository.find.mockResolvedValue(selections);
      mockMenuSelectionRepository.save.mockImplementation((data) =>
        Promise.resolve(Array.isArray(data) ? data : [data]),
      );
      mockUserService.getEntityPreferences.mockResolvedValue({
        likes: [],
        dislikes: [],
      });
      mockPreferenceUpdateAiService.generatePreferenceAnalysis.mockResolvedValue(
        {
          analysis: '다양한 시간대 메뉴 선호',
        },
      );
      mockUserService.updateEntityPreferencesAnalysis.mockResolvedValue({
        likes: [],
        dislikes: [],
        analysis: '다양한 시간대 메뉴 선호',
      });

      await scheduler.processPendingSelections();

      // All three selections should be grouped together
      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockPreferenceUpdateAiService.generatePreferenceAnalysis,
      ).toHaveBeenCalledWith(expect.anything(), {
        breakfast: ['아침메뉴1'],
        lunch: ['점심메뉴1'],
        dinner: ['저녁메뉴1'],
        etc: [],
      });

      // Should mark all 3 selections as SUCCEEDED
      const finalSaveCall = mockMenuSelectionRepository.save.mock.calls.find(
        (call) =>
          call[0].some(
            (item: MenuSelection) =>
              item.status === MenuSelectionStatus.SUCCEEDED,
          ),
      );
      expect(finalSaveCall).toBeDefined();
      expect(finalSaveCall[0]).toHaveLength(3);
    });
  });
});
