import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SelectionGroupingService } from '../../services/selection-grouping.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '@/menu/entities/menu-selection.entity';
import {
  createMockRepository,
  createMockQueryBuilder,
} from '../../../../test/mocks/repository.mock';
import {
  UserFactory,
  MenuSelectionFactory,
} from '../../../../test/factories/entity.factory';
import { BATCH_CONFIG } from '@/common/constants/business.constants';

/**
 * Creates a fluent mock that handles the chained update builder pattern used in
 * markPermanentlyFailedSelections:
 *   .createQueryBuilder().update(Entity).set(...).where(...).andWhere(...).execute()
 *
 * TypeORM's SelectQueryBuilder.update() returns an UpdateQueryBuilder which exposes
 * .set(). Because the project mocks are typed as SelectQueryBuilder (which lacks
 * .set()), we build a plain object that satisfies all chained calls at runtime.
 */
function createUpdateChainQb() {
  const executeResult = { affected: 0 };
  const chain: Record<string, jest.Mock> = {
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    execute: jest.fn().mockResolvedValue(executeResult),
  };

  // Every method in the chain returns the chain object so calls can be chained
  chain.update.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.andWhere.mockReturnValue(chain);

  return chain;
}

describe('SelectionGroupingService', () => {
  let service: SelectionGroupingService;
  let mockRepository: ReturnType<typeof createMockRepository<MenuSelection>>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRepository = createMockRepository<MenuSelection>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelectionGroupingService,
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<SelectionGroupingService>(SelectionGroupingService);
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // collectPendingSelections
  // =========================================================================

  describe('collectPendingSelections', () => {
    it('should return empty array when no pending selections exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.collectPendingSelections();

      expect(result).toEqual([]);
      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: MenuSelectionStatus.PENDING },
        }),
      );
    });

    it('should query with take limit of 500', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.collectPendingSelections();

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 }),
      );
    });

    it('should query with user relation and ASC order', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.collectPendingSelections();

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['user'],
          order: { selectedAt: 'ASC' },
        }),
      );
    });

    it('should group selections by user and return UserSelectionGroup array', async () => {
      const user1 = UserFactory.create({ id: 1 });
      const user2 = UserFactory.create({ id: 2 });
      const sel1 = MenuSelectionFactory.createPending(user1);
      sel1.menuPayload = { breakfast: ['토스트'], lunch: [], dinner: [], etc: [] };
      const sel2 = MenuSelectionFactory.createPending(user2);
      sel2.menuPayload = { breakfast: [], lunch: ['된장찌개'], dinner: [], etc: [] };

      mockRepository.find.mockResolvedValue([sel1, sel2]);

      const result = await service.collectPendingSelections();

      expect(result).toHaveLength(2);
      const group1 = result.find((g) => g.user.id === 1);
      const group2 = result.find((g) => g.user.id === 2);
      expect(group1).toBeDefined();
      expect(group2).toBeDefined();
      expect(group1!.slotMenus.breakfast).toContain('토스트');
      expect(group2!.slotMenus.lunch).toContain('된장찌개');
    });

    it('should aggregate multiple selections from the same user into one group', async () => {
      const user = UserFactory.create({ id: 1 });
      const sel1 = MenuSelectionFactory.createPending(user);
      sel1.id = 10;
      sel1.menuPayload = { breakfast: ['빵'], lunch: [], dinner: [], etc: [] };
      const sel2 = MenuSelectionFactory.createPending(user);
      sel2.id = 11;
      sel2.menuPayload = { breakfast: [], lunch: ['비빔밥'], dinner: [], etc: [] };

      mockRepository.find.mockResolvedValue([sel1, sel2]);

      const result = await service.collectPendingSelections();

      expect(result).toHaveLength(1);
      expect(result[0].selections).toHaveLength(2);
      expect(result[0].slotMenus.breakfast).toContain('빵');
      expect(result[0].slotMenus.lunch).toContain('비빔밥');
    });
  });

  // =========================================================================
  // collectFailedSelectionsForRetry
  // =========================================================================

  describe('collectFailedSelectionsForRetry', () => {
    it('should return empty array when no failed selections are below max retry count', async () => {
      const updateQb = createUpdateChainQb();
      const selectQb = createMockQueryBuilder<MenuSelection>();
      (selectQb.getMany as jest.Mock).mockResolvedValue([]);

      mockRepository.createQueryBuilder
        .mockReturnValueOnce(updateQb as any)
        .mockReturnValueOnce(selectQb as any);

      const result = await service.collectFailedSelectionsForRetry();

      expect(result).toEqual([]);
    });

    it('should call markPermanentlyFailedSelections before querying failed selections', async () => {
      const updateQb = createUpdateChainQb();
      (updateQb.execute as jest.Mock).mockResolvedValue({ affected: 2 });

      const selectQb = createMockQueryBuilder<MenuSelection>();
      (selectQb.getMany as jest.Mock).mockResolvedValue([]);

      mockRepository.createQueryBuilder
        .mockReturnValueOnce(updateQb as any)
        .mockReturnValueOnce(selectQb as any);

      await service.collectFailedSelectionsForRetry();

      // updateQb was used for the permanently-failed update
      expect(updateQb.execute).toHaveBeenCalled();
      // selectQb was used for the retry query
      expect(selectQb.getMany).toHaveBeenCalled();
    });

    it('should use BATCH_CONFIG.MAX_RETRY_COUNT as the default maxRetries', async () => {
      const updateQb = createUpdateChainQb();
      const selectQb = createMockQueryBuilder<MenuSelection>();
      (selectQb.getMany as jest.Mock).mockResolvedValue([]);

      mockRepository.createQueryBuilder
        .mockReturnValueOnce(updateQb as any)
        .mockReturnValueOnce(selectQb as any);

      await service.collectFailedSelectionsForRetry();

      // andWhere should have been called with maxRetries = BATCH_CONFIG.MAX_RETRY_COUNT
      expect(selectQb.andWhere).toHaveBeenCalledWith(
        'selection.retryCount < :maxRetries',
        { maxRetries: BATCH_CONFIG.MAX_RETRY_COUNT },
      );
    });

    it('should accept a custom maxRetries parameter', async () => {
      const updateQb = createUpdateChainQb();
      const selectQb = createMockQueryBuilder<MenuSelection>();
      (selectQb.getMany as jest.Mock).mockResolvedValue([]);

      mockRepository.createQueryBuilder
        .mockReturnValueOnce(updateQb as any)
        .mockReturnValueOnce(selectQb as any);

      await service.collectFailedSelectionsForRetry(5);

      expect(selectQb.andWhere).toHaveBeenCalledWith(
        'selection.retryCount < :maxRetries',
        { maxRetries: 5 },
      );
    });

    it('should return grouped results when failed selections exist', async () => {
      const user = UserFactory.create({ id: 1 });
      const failedSel = MenuSelectionFactory.create({
        user,
        status: MenuSelectionStatus.FAILED,
        retryCount: 1,
      });
      failedSel.menuPayload = {
        breakfast: [],
        lunch: ['냉면'],
        dinner: [],
        etc: [],
      };

      const updateQb = createUpdateChainQb();
      const selectQb = createMockQueryBuilder<MenuSelection>();
      (selectQb.getMany as jest.Mock).mockResolvedValue([failedSel]);

      mockRepository.createQueryBuilder
        .mockReturnValueOnce(updateQb as any)
        .mockReturnValueOnce(selectQb as any);

      const result = await service.collectFailedSelectionsForRetry();

      expect(result).toHaveLength(1);
      expect(result[0].user.id).toBe(1);
      expect(result[0].slotMenus.lunch).toContain('냉면');
    });
  });

  // =========================================================================
  // groupSelectionsToUserMap
  // =========================================================================

  describe('groupSelectionsToUserMap', () => {
    it('should return empty array when selections array is empty', () => {
      const result = service.groupSelectionsToUserMap([]);
      expect(result).toEqual([]);
    });

    it('should skip selections that have no user relation', () => {
      const selWithNoUser = MenuSelectionFactory.create();
      (selWithNoUser as any).user = null;

      const result = service.groupSelectionsToUserMap([selWithNoUser]);
      expect(result).toEqual([]);
    });

    it('should deduplicate menus within the same slot for a single user', () => {
      const user = UserFactory.create({ id: 1 });
      const sel1 = MenuSelectionFactory.create({
        user,
        menuPayload: { breakfast: [], lunch: ['된장찌개'], dinner: [], etc: [] },
      });
      const sel2 = MenuSelectionFactory.create({
        user,
        menuPayload: { breakfast: [], lunch: ['된장찌개'], dinner: [], etc: [] },
      });

      const result = service.groupSelectionsToUserMap([sel1, sel2]);

      expect(result).toHaveLength(1);
      expect(result[0].slotMenus.lunch).toEqual(['된장찌개']);
    });

    it('should collect menus from all slots into the correct slot arrays', () => {
      const user = UserFactory.create({ id: 1 });
      const sel = MenuSelectionFactory.create({
        user,
        menuPayload: {
          breakfast: ['토스트'],
          lunch: ['김치찌개'],
          dinner: ['삼겹살'],
          etc: ['커피'],
        },
      });

      const result = service.groupSelectionsToUserMap([sel]);

      expect(result[0].slotMenus.breakfast).toContain('토스트');
      expect(result[0].slotMenus.lunch).toContain('김치찌개');
      expect(result[0].slotMenus.dinner).toContain('삼겹살');
      expect(result[0].slotMenus.etc).toContain('커피');
    });

    it('should filter out empty-string menu names from payloads', () => {
      const user = UserFactory.create({ id: 1 });
      const sel = MenuSelectionFactory.create({
        user,
        menuPayload: {
          breakfast: ['  ', ''],
          lunch: ['비빔밥'],
          dinner: [],
          etc: [],
        },
      });

      const result = service.groupSelectionsToUserMap([sel]);

      // normalizeMenuName trims whitespace; empty/whitespace-only strings are filtered
      expect(result[0].slotMenus.breakfast).toEqual([]);
      expect(result[0].slotMenus.lunch).toContain('비빔밥');
    });

    it('should create separate groups for different users', () => {
      const user1 = UserFactory.create({ id: 1 });
      const user2 = UserFactory.create({ id: 2 });
      const sel1 = MenuSelectionFactory.create({
        user: user1,
        menuPayload: { breakfast: ['빵'], lunch: [], dinner: [], etc: [] },
      });
      const sel2 = MenuSelectionFactory.create({
        user: user2,
        menuPayload: { breakfast: [], lunch: ['국밥'], dinner: [], etc: [] },
      });

      const result = service.groupSelectionsToUserMap([sel1, sel2]);

      expect(result).toHaveLength(2);
    });

    it('should handle payload in legacy { names: string[] } format by placing in etc slot', () => {
      const user = UserFactory.create({ id: 1 });
      const sel = MenuSelectionFactory.create({ user });
      (sel as any).menuPayload = { names: ['떡볶이', '순대'] };

      const result = service.groupSelectionsToUserMap([sel]);

      expect(result[0].slotMenus.etc).toContain('떡볶이');
      expect(result[0].slotMenus.etc).toContain('순대');
    });

    it('should handle payload in legacy { name: string } format by placing in etc slot', () => {
      const user = UserFactory.create({ id: 1 });
      const sel = MenuSelectionFactory.create({ user });
      (sel as any).menuPayload = { name: '칼국수' };

      const result = service.groupSelectionsToUserMap([sel]);

      expect(result[0].slotMenus.etc).toContain('칼국수');
    });

    it('should handle null/undefined menuPayload gracefully', () => {
      const user = UserFactory.create({ id: 1 });
      const sel = MenuSelectionFactory.create({ user });
      (sel as any).menuPayload = null;

      const result = service.groupSelectionsToUserMap([sel]);

      // No menus to add but the group itself is still created
      expect(result).toHaveLength(1);
      expect(result[0].slotMenus.breakfast).toEqual([]);
      expect(result[0].slotMenus.lunch).toEqual([]);
      expect(result[0].slotMenus.dinner).toEqual([]);
      expect(result[0].slotMenus.etc).toEqual([]);
    });

    it('should include the user entity in each group', () => {
      const user = UserFactory.create({ id: 7, email: 'group@test.com' });
      const sel = MenuSelectionFactory.createPending(user);

      const result = service.groupSelectionsToUserMap([sel]);

      expect(result[0].user).toEqual(user);
    });

    it('should include the selection in the group selections array', () => {
      const user = UserFactory.create({ id: 1 });
      const sel = MenuSelectionFactory.createPending(user);
      sel.id = 99;

      const result = service.groupSelectionsToUserMap([sel]);

      expect(result[0].selections).toContain(sel);
    });
  });
});
