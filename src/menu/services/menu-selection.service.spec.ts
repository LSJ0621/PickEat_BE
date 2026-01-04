import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { MenuSelectionService } from './menu-selection.service';
import { MenuRecommendationService } from './menu-recommendation.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '../entities/menu-selection.entity';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import {
  UserFactory,
  MenuSelectionFactory,
  MenuRecommendationFactory,
} from '../../../test/factories/entity.factory';

describe('MenuSelectionService', () => {
  let service: MenuSelectionService;
  let mockMenuSelectionRepository: jest.Mocked<any>;
  let mockMenuRecommendationService: jest.Mocked<MenuRecommendationService>;

  beforeEach(async () => {
    mockMenuSelectionRepository = createMockRepository<MenuSelection>() as any;
    mockMenuRecommendationService = {
      findOwnedRecommendation: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuSelectionService,
        {
          provide: getRepositoryToken(MenuSelection),
          useValue: mockMenuSelectionRepository,
        },
        {
          provide: MenuRecommendationService,
          useValue: mockMenuRecommendationService,
        },
      ],
    }).compile();

    service = module.get<MenuSelectionService>(MenuSelectionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSelection', () => {
    it('should create new selection when none exists for the date', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [
        { slot: 'breakfast', name: '김치찌개' },
        { slot: 'lunch', name: '된장찌개' },
      ];

      mockMenuSelectionRepository.findOne.mockResolvedValue(null);

      const createdSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
        status: MenuSelectionStatus.PENDING,
      });

      mockMenuSelectionRepository.create.mockReturnValue(createdSelection);
      mockMenuSelectionRepository.save.mockResolvedValue(createdSelection);

      const result = await service.createSelection(user, menus);

      expect(mockMenuSelectionRepository.findOne).toHaveBeenCalledWith({
        where: { user: { id: 1 }, selectedDate: expect.any(String) },
        relations: ['user'],
      });
      expect(mockMenuSelectionRepository.create).toHaveBeenCalledWith({
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
        user,
        selectedAt: expect.any(Date),
        selectedDate: expect.any(String),
        status: MenuSelectionStatus.PENDING,
        lastTriedAt: null,
        retryCount: 0,
      });
      expect(result).toEqual(createdSelection);
    });

    it('should merge with existing selection for the same date', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [{ slot: 'dinner', name: '순두부찌개' }];

      const existingSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.findOne.mockResolvedValue(existingSelection);

      const updatedSelection = {
        ...existingSelection,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: ['순두부찌개'],
          etc: [],
        },
      };

      mockMenuSelectionRepository.save.mockResolvedValue(updatedSelection);

      const result = await service.createSelection(user, menus);

      expect(result.menuPayload).toEqual({
        breakfast: ['김치찌개'],
        lunch: ['된장찌개'],
        dinner: ['순두부찌개'],
        etc: [],
      });
      expect(mockMenuSelectionRepository.save).toHaveBeenCalled();
    });

    it('should link to menu recommendation when historyId is provided', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [{ slot: 'breakfast', name: '김치찌개' }];
      const historyId = 5;

      const recommendation = MenuRecommendationFactory.create({
        id: historyId,
        user,
      });
      mockMenuRecommendationService.findOwnedRecommendation.mockResolvedValue(
        recommendation,
      );

      mockMenuSelectionRepository.findOne.mockResolvedValue(null);

      const createdSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        menuRecommendation: recommendation,
      });

      mockMenuSelectionRepository.create.mockReturnValue(createdSelection);
      mockMenuSelectionRepository.save.mockResolvedValue(createdSelection);

      await service.createSelection(user, menus, historyId);

      expect(
        mockMenuRecommendationService.findOwnedRecommendation,
      ).toHaveBeenCalledWith(historyId, user);
    });

    it('should throw BadRequestException when menus array is empty', async () => {
      const user = UserFactory.create({ id: 1 });

      await expect(service.createSelection(user, [])).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createSelection(user, [])).rejects.toThrow(
        '메뉴가 비어있습니다.',
      );
    });

    it('should throw BadRequestException when all menus are invalid', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [
        { slot: 'breakfast', name: '   ' },
        { slot: 'lunch', name: '' },
      ];

      await expect(service.createSelection(user, menus)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createSelection(user, menus)).rejects.toThrow(
        '유효한 메뉴가 없습니다.',
      );
    });

    it('should deduplicate menus in the same slot', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [
        { slot: 'breakfast', name: '김치찌개' },
        { slot: 'breakfast', name: '김치찌개' },
        { slot: 'breakfast', name: '된장찌개' },
      ];

      mockMenuSelectionRepository.findOne.mockResolvedValue(null);

      const createdSelection = MenuSelectionFactory.create({
        menuPayload: {
          breakfast: ['김치찌개', '된장찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      mockMenuSelectionRepository.create.mockReturnValue(createdSelection);
      mockMenuSelectionRepository.save.mockResolvedValue(createdSelection);

      const result = await service.createSelection(user, menus);

      expect(result.menuPayload.breakfast).toEqual(['김치찌개', '된장찌개']);
    });

    it('should reset status to PENDING when merging existing selection', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [{ slot: 'breakfast', name: '김치찌개' }];

      const existingSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.SUCCEEDED,
        retryCount: 3,
        lastTriedAt: new Date(),
      });

      mockMenuSelectionRepository.findOne.mockResolvedValue(existingSelection);
      mockMenuSelectionRepository.save.mockResolvedValue({
        ...existingSelection,
        status: MenuSelectionStatus.PENDING,
        retryCount: 0,
        lastTriedAt: null,
      });

      const result = await service.createSelection(user, menus);

      expect(result.status).toBe(MenuSelectionStatus.PENDING);
      expect(result.retryCount).toBe(0);
      expect(result.lastTriedAt).toBeNull();
    });
  });

  describe('updateSelection', () => {
    it('should update selection with new menu data', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      const updateDto = {
        breakfast: ['된장찌개', '순두부찌개'],
      };

      mockMenuSelectionRepository.findOne
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce({
          ...selection,
          menuPayload: {
            breakfast: ['된장찌개', '순두부찌개'],
            lunch: [],
            dinner: [],
            etc: [],
          },
        });

      mockMenuSelectionRepository.update.mockResolvedValue({
        affected: 1,
      } as any);

      const result = await service.updateSelection(user, 1, updateDto);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(1, {
        menuPayload: {
          breakfast: ['된장찌개', '순두부찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
        status: MenuSelectionStatus.PENDING,
        selectedAt: expect.any(Date),
        selectedDate: expect.any(String),
        lastTriedAt: null,
        retryCount: 0,
      });
    });

    it('should cancel selection when cancel flag is true', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({ id: 1, user });

      const updateDto = { cancel: true };

      mockMenuSelectionRepository.findOne
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce({
          ...selection,
          status: MenuSelectionStatus.CANCELLED,
        });

      mockMenuSelectionRepository.update.mockResolvedValue({
        affected: 1,
      } as any);

      const result = await service.updateSelection(user, 1, updateDto);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(1, {
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: { breakfast: [], lunch: [], dinner: [], etc: [] },
        selectedAt: expect.any(Date),
        selectedDate: expect.any(String),
        lastTriedAt: null,
        retryCount: 0,
      });
      expect(result.status).toBe(MenuSelectionStatus.CANCELLED);
    });

    it('should throw BadRequestException when selection not found', async () => {
      const user = UserFactory.create({ id: 1 });
      const updateDto = { breakfast: ['김치찌개'] };

      mockMenuSelectionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateSelection(user, 999, updateDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateSelection(user, 999, updateDto),
      ).rejects.toThrow('선택 이력을 찾을 수 없습니다.');
    });

    it('should throw BadRequestException when no slot is updated', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({ id: 1, user });

      mockMenuSelectionRepository.findOne.mockResolvedValue(selection);

      await expect(service.updateSelection(user, 1, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateSelection(user, 1, {})).rejects.toThrow(
        '변경할 메뉴가 없습니다.',
      );
    });

    it('should filter out empty menu names when updating', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({ id: 1, user });

      const updateDto = {
        breakfast: ['김치찌개', '  ', '', '된장찌개'],
      };

      mockMenuSelectionRepository.findOne
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce(selection);

      mockMenuSelectionRepository.update.mockResolvedValue({
        affected: 1,
      } as any);

      await service.updateSelection(user, 1, updateDto);

      const updateCall = mockMenuSelectionRepository.update.mock.calls[0][1];
      expect(updateCall.menuPayload.breakfast).toEqual([
        '김치찌개',
        '된장찌개',
      ]);
    });

    it('should throw BadRequestException when updated selection not found after update', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({ id: 1, user });

      mockMenuSelectionRepository.findOne
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce(null);

      mockMenuSelectionRepository.update.mockResolvedValue({
        affected: 1,
      } as any);

      const promise = service.updateSelection(user, 1, {
        breakfast: ['김치찌개'],
      });

      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toThrow(
        '업데이트된 선택 이력을 찾을 수 없습니다.',
      );
    });
  });

  describe('getSelections', () => {
    it('should return all selections for user', async () => {
      const user = UserFactory.create({ id: 1 });
      const selections = [
        MenuSelectionFactory.create({ id: 1, user }),
        MenuSelectionFactory.create({ id: 2, user }),
      ];

      mockMenuSelectionRepository.find.mockResolvedValue(selections);

      const result = await service.getSelections(user);

      expect(mockMenuSelectionRepository.find).toHaveBeenCalledWith({
        where: { user: { id: 1 } },
        order: { selectedAt: 'DESC' },
        relations: ['menuRecommendation'],
      });
      expect(result).toHaveLength(2);
    });

    it('should filter by selectedDate when provided', async () => {
      const user = UserFactory.create({ id: 1 });
      const selectedDate = '2024-01-15';

      mockMenuSelectionRepository.find.mockResolvedValue([]);

      await service.getSelections(user, selectedDate);

      expect(mockMenuSelectionRepository.find).toHaveBeenCalledWith({
        where: { user: { id: 1 }, selectedDate: '2024-01-15' },
        order: { selectedAt: 'DESC' },
        relations: ['menuRecommendation'],
      });
    });

    it('should normalize legacy menuPayload structure', async () => {
      const user = UserFactory.create({ id: 1 });
      const selectionWithLegacyPayload = {
        ...MenuSelectionFactory.create({ id: 1, user }),
        menuPayload: { name: '김치찌개' } as any,
      };

      mockMenuSelectionRepository.find.mockResolvedValue([
        selectionWithLegacyPayload,
      ]);

      const result = await service.getSelections(user);

      expect(result[0].menuPayload).toEqual({
        breakfast: [],
        lunch: [],
        dinner: [],
        etc: ['김치찌개'],
      });
    });

    it('should return empty array when no selections exist', async () => {
      const user = UserFactory.create({ id: 1 });

      mockMenuSelectionRepository.find.mockResolvedValue([]);

      const result = await service.getSelections(user);

      expect(result).toEqual([]);
    });
  });
});
