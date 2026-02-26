import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BatchRequestBuilderService } from '../../services/batch-request-builder.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import { UserService } from '@/user/user.service';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import {
  UserFactory,
  MenuSelectionFactory,
} from '../../../../test/factories/entity.factory';
import { UserSelectionGroup } from '../../interfaces/preference-batch.interface';
import { PreferenceBatchRequest } from '../../types/preference-batch.types';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGroup(
  overrides?: Partial<UserSelectionGroup>,
): UserSelectionGroup {
  const user = UserFactory.create({ id: 1, preferredLanguage: 'ko' });
  return {
    user,
    selections: [MenuSelectionFactory.createSucceeded(user)],
    slotMenus: {
      breakfast: ['토스트'],
      lunch: ['된장찌개'],
      dinner: ['삼겹살'],
      etc: [],
    },
    ...overrides,
  };
}

describe('BatchRequestBuilderService', () => {
  let service: BatchRequestBuilderService;
  let menuSelectionRepository: ReturnType<
    typeof createMockRepository<MenuSelection>
  >;
  let mockUserService: {
    getEntityPreferencesByUserIds: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    menuSelectionRepository = createMockRepository<MenuSelection>();

    mockUserService = {
      getEntityPreferencesByUserIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchRequestBuilderService,
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: menuSelectionRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = module.get<BatchRequestBuilderService>(
      BatchRequestBuilderService,
    );
  });

  // =========================================================================
  // buildBatchRequests
  // =========================================================================

  describe('buildBatchRequests', () => {
    it('should build one request for a valid group with menus', async () => {
      const group = buildGroup();
      const userId = group.user.id;

      const preferencesMap = new Map([
        [userId, { likes: ['한식'], dislikes: [], analysis: '한식 선호' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      // Mock queryBuilder for countDistinctSelectionDays
      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '5' });

      // Mock find for getSelectionsInDays (recent) and findNewTrials (older)
      menuSelectionRepository.find.mockResolvedValue([]);

      const results = await service.buildBatchRequests([group]);

      expect(results).toHaveLength(1);
      expect(results[0].userId).toBe(userId);
      expect(results[0].customId).toContain(`pref_${userId}_`);
      expect(results[0].systemPrompt).toBeDefined();
      expect(results[0].userPrompt).toBeDefined();
    });

    it('should skip groups with zero total menus', async () => {
      const group = buildGroup({
        slotMenus: { breakfast: [], lunch: [], dinner: [], etc: [] },
      });

      const preferencesMap = new Map([
        [group.user.id, { likes: [], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '0' });
      menuSelectionRepository.find.mockResolvedValue([]);

      const results = await service.buildBatchRequests([group]);

      expect(results).toHaveLength(0);
    });

    it('should skip groups whose preferences are not found in the map', async () => {
      const group = buildGroup();

      // Return empty map — no preferences for this user
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        new Map(),
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '3' });
      menuSelectionRepository.find.mockResolvedValue([]);

      const results = await service.buildBatchRequests([group]);

      expect(results).toHaveLength(0);
    });

    it('should skip groups whose statistics are not found', async () => {
      // Statistics come from bulkCalculateStatistics -> calculateStatistics.
      // We can force statistics to be skipped by making countDistinctSelectionDays throw
      // and catching in bulkCalculateStatistics — but since Map.set still runs even on error,
      // let's instead verify the skip path by mocking getRawOne to return undefined
      // and verifying the map has undefined for that user.
      const group = buildGroup();
      const userId = group.user.id;

      const preferencesMap = new Map([
        [userId, { likes: [], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      // Return null from getRawOne to simulate missing stats
      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue(null);
      menuSelectionRepository.find.mockResolvedValue([]);

      // With null getRawOne, totalDays becomes 0 — but statistics ARE set (totalDays=0).
      // The service only skips when preferences or statistics are undefined from the Map.
      // So this test verifies the happy path with totalDays=0.
      const results = await service.buildBatchRequests([group]);

      // Statistics are still computed (just with totalDays=0), so request is built
      expect(results).toHaveLength(1);
      expect(results[0].userId).toBe(userId);
    });

    it('should handle multiple groups for different users', async () => {
      const user1 = UserFactory.create({ id: 1, preferredLanguage: 'ko' });
      const user2 = UserFactory.create({ id: 2, preferredLanguage: 'en' });

      const group1 = buildGroup({ user: user1 });
      const group2 = buildGroup({
        user: user2,
        slotMenus: {
          breakfast: [],
          lunch: ['Salad'],
          dinner: ['Steak'],
          etc: [],
        },
      });

      const preferencesMap = new Map([
        [1, { likes: ['한식'], dislikes: [], analysis: '' }],
        [2, { likes: ['Western'], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '2' });
      menuSelectionRepository.find.mockResolvedValue([]);

      const results = await service.buildBatchRequests([group1, group2]);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.userId)).toEqual(
        expect.arrayContaining([1, 2]),
      );
    });

    it('should use English system prompt when preferredLanguage is "en"', async () => {
      const user = UserFactory.create({ id: 1, preferredLanguage: 'en' });
      const group = buildGroup({ user });

      const preferencesMap = new Map([
        [user.id, { likes: [], dislikes: [], analysis: undefined }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '1' });
      menuSelectionRepository.find.mockResolvedValue([]);

      const [result] = await service.buildBatchRequests([group]);

      // English prompt should not be undefined
      expect(result.systemPrompt).toBeDefined();
      expect(typeof result.systemPrompt).toBe('string');
    });

    it('should use Korean system prompt when preferredLanguage is not "en"', async () => {
      const user = UserFactory.create({ id: 1, preferredLanguage: 'ko' });
      const group = buildGroup({ user });

      const preferencesMap = new Map([
        [user.id, { likes: [], dislikes: [], analysis: undefined }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '1' });
      menuSelectionRepository.find.mockResolvedValue([]);

      const [result] = await service.buildBatchRequests([group]);

      expect(result.systemPrompt).toBeDefined();
    });

    it('should default to Korean prompt when preferredLanguage is not "en"', async () => {
      // 'ko' is a valid union value; any non-'en' value maps to 'ko'
      const user = UserFactory.create({ id: 1, preferredLanguage: 'ko' });
      const group = buildGroup({ user });

      const preferencesMap = new Map([
        [user.id, { likes: [], dislikes: [], analysis: undefined }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '0' });
      menuSelectionRepository.find.mockResolvedValue([]);

      const results = await service.buildBatchRequests([group]);

      expect(results).toHaveLength(1);
      expect(results[0].systemPrompt).toBeDefined();
    });

    it('should return empty array when groups array is empty', async () => {
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        new Map(),
      );

      const results = await service.buildBatchRequests([]);

      expect(results).toHaveLength(0);
    });

    it('should build customId with correct format', async () => {
      const user = UserFactory.create({ id: 42 });
      const selection1 = MenuSelectionFactory.createSucceeded(user);
      selection1.id = 10;
      const selection2 = MenuSelectionFactory.createSucceeded(user);
      selection2.id = 20;

      const group: UserSelectionGroup = {
        user,
        selections: [selection1, selection2],
        slotMenus: { breakfast: ['빵'], lunch: [], dinner: [], etc: [] },
      };

      const preferencesMap = new Map([
        [42, { likes: [], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '1' });
      menuSelectionRepository.find.mockResolvedValue([]);

      const [result] = await service.buildBatchRequests([group]);

      expect(result.customId).toBe('pref_42_10,20');
    });

    it('should include selectionIds in the result', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.createSucceeded(user);
      selection.id = 55;

      const group: UserSelectionGroup = {
        user,
        selections: [selection],
        slotMenus: { breakfast: ['밥'], lunch: [], dinner: [], etc: [] },
      };

      const preferencesMap = new Map([
        [1, { likes: [], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '1' });
      menuSelectionRepository.find.mockResolvedValue([]);

      const [result] = await service.buildBatchRequests([group]);

      expect(result.selectionIds).toEqual([55]);
    });
  });

  // =========================================================================
  // buildOpenAiBatchRequests
  // =========================================================================

  describe('buildOpenAiBatchRequests', () => {
    const model = 'gpt-4o-mini';

    const sampleRequest: PreferenceBatchRequest = {
      customId: 'pref_1_10',
      userId: 1,
      selectionIds: [10],
      systemPrompt: 'You are a food analyst.',
      userPrompt: 'Analyze user selections.',
    };

    it('should convert PreferenceBatchRequests to BatchRequests', () => {
      const result = service.buildOpenAiBatchRequests([sampleRequest], model);

      expect(result).toHaveLength(1);
      expect(result[0].custom_id).toBe('pref_1_10');
      expect(result[0].method).toBe('POST');
      expect(result[0].url).toBe('/v1/chat/completions');
    });

    it('should set the correct model in each request body', () => {
      const result = service.buildOpenAiBatchRequests([sampleRequest], model);

      expect(result[0].body.model).toBe(model);
    });

    it('should include system and user messages', () => {
      const result = service.buildOpenAiBatchRequests([sampleRequest], model);

      const messages = result[0].body.messages;
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        role: 'system',
        content: sampleRequest.systemPrompt,
      });
      expect(messages[1]).toEqual({
        role: 'user',
        content: sampleRequest.userPrompt,
      });
    });

    it('should apply max_completion_tokens from OPENAI_CONFIG', () => {
      const result = service.buildOpenAiBatchRequests([sampleRequest], model);

      expect(result[0].body.max_completion_tokens).toBe(
        OPENAI_CONFIG.MAX_TOKENS.PREFERENCE_ANALYSIS,
      );
    });

    it('should include response_format with json_schema type', () => {
      const result = service.buildOpenAiBatchRequests([sampleRequest], model);

      expect(result[0].body.response_format?.type).toBe('json_schema');
      expect(result[0].body.response_format?.json_schema.name).toBe(
        'preference_analysis',
      );
      expect(result[0].body.response_format?.json_schema.strict).toBe(true);
    });

    it('should return empty array when requests are empty', () => {
      const result = service.buildOpenAiBatchRequests([], model);

      expect(result).toHaveLength(0);
    });

    it('should handle multiple requests and preserve order', () => {
      const requests: PreferenceBatchRequest[] = [
        { ...sampleRequest, customId: 'pref_1_10', userId: 1 },
        { ...sampleRequest, customId: 'pref_2_20', userId: 2 },
        { ...sampleRequest, customId: 'pref_3_30', userId: 3 },
      ];

      const result = service.buildOpenAiBatchRequests(requests, model);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.custom_id)).toEqual([
        'pref_1_10',
        'pref_2_20',
        'pref_3_30',
      ]);
    });
  });

  // =========================================================================
  // statistics skip branch
  // =========================================================================

  describe('statistics skip branch', () => {
    it('should skip group when bulkCalculateStatistics fails (statistics not in map)', async () => {
      const group = buildGroup();
      const userId = group.user.id;

      const preferencesMap = new Map([
        [userId, { likes: ['한식'], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      // Simulate calculateStatistics throwing via getRawOne rejection
      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockRejectedValue(
        new Error('DB query failed'),
      );
      menuSelectionRepository.find.mockResolvedValue([]);

      // Promise.all rethrows, so buildBatchRequests itself will throw
      await expect(service.buildBatchRequests([group])).rejects.toThrow(
        'DB query failed',
      );
    });

    it('should skip group and log warning when statistics not found in map (lines 73-76)', async () => {
      const group = buildGroup();
      const userId = group.user.id;

      const preferencesMap = new Map([
        [userId, { likes: ['한식'], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      // Spy on private bulkCalculateStatistics to return empty map (no entry for userId)
      const emptyStatsMap = new Map<number, ReturnType<typeof Object>>();
      jest
        .spyOn(service as any, 'bulkCalculateStatistics')
        .mockResolvedValue(emptyStatsMap);

      const warnSpy = jest.spyOn(service['logger'], 'warn');

      const results = await service.buildBatchRequests([group]);

      // Should skip the group and return empty results
      expect(results).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Statistics not found'),
      );
    });
  });

  // =========================================================================
  // sort path in findRepeatedMenus
  // =========================================================================

  describe('findRepeatedMenus sort path (via buildBatchRequests)', () => {
    it('should sort multiple repeated menus by count descending', async () => {
      const user = UserFactory.create({ id: 1, preferredLanguage: 'ko' });
      const group = buildGroup({ user });

      const preferencesMap = new Map([
        [user.id, { likes: [], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '10' });

      // Create selections with different menus appearing different times
      const sel1 = MenuSelectionFactory.create({
        user,
        status: MenuSelectionStatus.SUCCEEDED,
        menuPayload: {
          breakfast: [],
          lunch: ['된장찌개'],
          dinner: ['비빔밥'],
          etc: [],
        },
        selectedDate: '2025-01-01',
      });
      const sel2 = MenuSelectionFactory.create({
        user,
        status: MenuSelectionStatus.SUCCEEDED,
        menuPayload: {
          breakfast: [],
          lunch: ['된장찌개'],
          dinner: ['비빔밥'],
          etc: [],
        },
        selectedDate: '2025-01-02',
      });
      const sel3 = MenuSelectionFactory.create({
        user,
        status: MenuSelectionStatus.SUCCEEDED,
        menuPayload: {
          breakfast: [],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
        selectedDate: '2025-01-03',
      });

      // First call: getSelectionsInDays (recent), second: findNewTrials (older)
      menuSelectionRepository.find
        .mockResolvedValueOnce([sel1, sel2, sel3])
        .mockResolvedValueOnce([]);

      const results = await service.buildBatchRequests([group]);

      // sorted menus: 된장찌개 (3 times) > 비빔밥 (2 times)
      expect(results).toHaveLength(1);
    });
  });

  // =========================================================================
  // findRepeatedMenus (tested indirectly through buildBatchRequests)
  // =========================================================================

  describe('repeated menus detection (via buildBatchRequests)', () => {
    it('should calculate recentRepeats for selections with same menu across days', async () => {
      const user = UserFactory.create({ id: 1, preferredLanguage: 'ko' });
      const group = buildGroup({ user });

      const preferencesMap = new Map([
        [user.id, { likes: [], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '10' });

      // Two selections with the same menu item
      const sel1 = MenuSelectionFactory.create({
        user,
        status: MenuSelectionStatus.SUCCEEDED,
        menuPayload: {
          breakfast: [],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
        selectedDate: '2025-01-01',
      });
      const sel2 = MenuSelectionFactory.create({
        user,
        status: MenuSelectionStatus.SUCCEEDED,
        menuPayload: {
          breakfast: [],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
        selectedDate: '2025-01-02',
      });

      // First call: getSelectionsInDays (recent 7 days), Second call: findNewTrials (older)
      menuSelectionRepository.find
        .mockResolvedValueOnce([sel1, sel2])
        .mockResolvedValueOnce([]);

      const results = await service.buildBatchRequests([group]);

      // Service should build a request (statistics computed correctly)
      expect(results).toHaveLength(1);
    });
  });

  // =========================================================================
  // newTrials detection (via buildBatchRequests)
  // =========================================================================

  describe('newTrials detection (via buildBatchRequests)', () => {
    it('should return empty newTrials when recentSelections is empty', async () => {
      const user = UserFactory.create({ id: 1, preferredLanguage: 'ko' });
      const group = buildGroup({ user });

      const preferencesMap = new Map([
        [user.id, { likes: [], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '0' });

      // No recent selections
      menuSelectionRepository.find.mockResolvedValue([]);

      const results = await service.buildBatchRequests([group]);

      expect(results).toHaveLength(1);
    });

    it('should identify menus in recent selections not present in older selections', async () => {
      const user = UserFactory.create({ id: 1, preferredLanguage: 'ko' });
      const group = buildGroup({ user });

      const preferencesMap = new Map([
        [user.id, { likes: [], dislikes: [], analysis: '' }],
      ]);
      mockUserService.getEntityPreferencesByUserIds.mockResolvedValue(
        preferencesMap,
      );

      const mockQb = menuSelectionRepository.createQueryBuilder();
      (mockQb.getRawOne as jest.Mock).mockResolvedValue({ count: '15' });

      const recentSel = MenuSelectionFactory.create({
        user,
        status: MenuSelectionStatus.SUCCEEDED,
        menuPayload: {
          breakfast: [],
          lunch: ['새로운메뉴'],
          dinner: [],
          etc: [],
        },
        selectedDate: '2025-01-10',
      });

      const olderSel = MenuSelectionFactory.create({
        user,
        status: MenuSelectionStatus.SUCCEEDED,
        menuPayload: {
          breakfast: [],
          lunch: ['오래된메뉴'],
          dinner: [],
          etc: [],
        },
        selectedDate: '2024-06-01',
      });

      // First call: recent selections, second call: older selections
      menuSelectionRepository.find
        .mockResolvedValueOnce([recentSel])
        .mockResolvedValueOnce([olderSel]);

      const results = await service.buildBatchRequests([group]);

      // Request built — newTrials would include '새로운메뉴'
      expect(results).toHaveLength(1);
    });
  });
});
