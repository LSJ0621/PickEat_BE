import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MenuSelection, MenuSelectionStatus } from '@/menu/entities/menu-selection.entity';
import { SelectionGroupingService } from '../services/selection-grouping.service';
import { UserFactory } from '../../../test/factories/entity.factory';
import { createMockRepository } from '../../../test/mocks/repository.mock';

describe('SelectionGroupingService', () => {
  let service: SelectionGroupingService;
  let mockRepository: ReturnType<typeof createMockRepository<MenuSelection>>;

  beforeEach(async () => {
    mockRepository = createMockRepository<MenuSelection>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelectionGroupingService,
        { provide: getRepositoryToken(MenuSelection), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<SelectionGroupingService>(SelectionGroupingService);
  });

  describe('groupSelectionsToUserMap', () => {
    it('같은 사용자의 selection을 하나의 그룹으로 묶는다', () => {
      const user = UserFactory.create({ id: 1 });
      const selections = [
        {
          id: 1,
          user,
          menuPayload: { breakfast: ['토스트'], lunch: [], dinner: [], etc: [] },
        },
        {
          id: 2,
          user,
          menuPayload: { breakfast: [], lunch: ['김치찌개'], dinner: [], etc: [] },
        },
      ] as unknown as MenuSelection[];

      const groups = service.groupSelectionsToUserMap(selections);

      expect(groups).toHaveLength(1);
      expect(groups[0].selections).toHaveLength(2);
      expect(groups[0].slotMenus.breakfast).toContain('토스트');
      expect(groups[0].slotMenus.lunch).toContain('김치찌개');
    });

    it('다른 사용자의 selection은 별도 그룹으로 분리한다', () => {
      const user1 = UserFactory.create({ id: 1 });
      const user2 = UserFactory.create({ id: 2 });
      const selections = [
        {
          id: 1,
          user: user1,
          menuPayload: { breakfast: [], lunch: ['비빔밥'], dinner: [], etc: [] },
        },
        {
          id: 2,
          user: user2,
          menuPayload: { breakfast: [], lunch: ['된장찌개'], dinner: [], etc: [] },
        },
      ] as unknown as MenuSelection[];

      const groups = service.groupSelectionsToUserMap(selections);

      expect(groups).toHaveLength(2);
    });

    it('같은 슬롯에 중복 메뉴가 있으면 deduplicate한다', () => {
      const user = UserFactory.create({ id: 1 });
      const selections = [
        {
          id: 1,
          user,
          menuPayload: { breakfast: [], lunch: ['김치찌개'], dinner: [], etc: [] },
        },
        {
          id: 2,
          user,
          menuPayload: { breakfast: [], lunch: ['김치찌개'], dinner: [], etc: [] },
        },
      ] as unknown as MenuSelection[];

      const groups = service.groupSelectionsToUserMap(selections);

      expect(groups[0].slotMenus.lunch).toEqual(['김치찌개']);
    });

    it('user가 없는 selection은 무시한다', () => {
      const user = UserFactory.create({ id: 1 });
      const selections = [
        {
          id: 1,
          user,
          menuPayload: { breakfast: [], lunch: ['비빔밥'], dinner: [], etc: [] },
        },
        {
          id: 2,
          user: null,
          menuPayload: { breakfast: [], lunch: ['김치찌개'], dinner: [], etc: [] },
        },
      ] as unknown as MenuSelection[];

      const groups = service.groupSelectionsToUserMap(selections);

      expect(groups).toHaveLength(1);
      expect(groups[0].user.id).toBe(1);
    });

    it('빈 배열이면 빈 결과를 반환한다', () => {
      const groups = service.groupSelectionsToUserMap([]);
      expect(groups).toHaveLength(0);
    });

    it('기존 구조 { names: [...] } payload를 etc 슬롯으로 변환한다', () => {
      const user = UserFactory.create({ id: 1 });
      const selections = [
        {
          id: 1,
          user,
          menuPayload: { names: ['라면', '김밥'] },
        },
      ] as unknown as MenuSelection[];

      const groups = service.groupSelectionsToUserMap(selections);

      expect(groups[0].slotMenus.etc).toContain('라면');
      expect(groups[0].slotMenus.etc).toContain('김밥');
    });
  });

  describe('collectPendingSelections', () => {
    it('PENDING 상태의 selection이 없으면 빈 배열을 반환한다', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.collectPendingSelections();

      expect(result).toHaveLength(0);
    });

    it('PENDING selection이 있으면 사용자별로 그룹핑하여 반환한다', async () => {
      const user = UserFactory.create({ id: 1 });
      mockRepository.find.mockResolvedValue([
        {
          id: 1,
          user,
          status: MenuSelectionStatus.PENDING,
          menuPayload: { breakfast: [], lunch: ['김치찌개'], dinner: [], etc: [] },
        },
      ] as unknown as MenuSelection[]);

      const result = await service.collectPendingSelections();

      expect(result).toHaveLength(1);
      expect(result[0].slotMenus.lunch).toContain('김치찌개');
    });
  });
});
