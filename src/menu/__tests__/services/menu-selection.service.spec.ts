import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MenuSelectionService } from '../../services/menu-selection.service';
import { MenuRecommendationService } from '../../services/menu-recommendation.service';
import {
  MenuSelection,
  MenuSelectionStatus,
} from '../../entities/menu-selection.entity';
import { createMockRepository } from '../../../../test/mocks/repository.mock';
import {
  UserFactory,
  MenuSelectionFactory,
  MenuRecommendationFactory,
} from '../../../../test/factories/entity.factory';

describe('MenuSelectionService', () => {
  let service: MenuSelectionService;
  let mockMenuSelectionRepository: jest.Mocked<any>;
  let mockMenuRecommendationService: jest.Mocked<MenuRecommendationService>;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockMenuSelectionRepository = createMockRepository<MenuSelection>();
    mockMenuRecommendationService = {
      findOwnedRecommendation: jest.fn(),
    } as unknown as jest.Mocked<MenuRecommendationService>;

    // Create mock DataSource with transaction method
    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (callback: any) => {
        return callback({
          findOne: jest.fn(),
          create: jest.fn(),
          save: jest.fn(),
        });
      }),
    } as unknown as jest.Mocked<DataSource>;

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
        {
          provide: DataSource,
          useValue: mockDataSource,
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

      // Mock EntityManager for transaction
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdSelection),
        save: jest.fn().mockResolvedValue(createdSelection),
      };

      (mockDataSource.transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          return callback(mockManager);
        },
      );

      const result = await service.createSelection(user, menus);

      expect(mockManager.findOne).toHaveBeenCalledWith(MenuSelection, {
        where: { user: { id: 1 }, selectedDate: expect.any(String) },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockManager.create).toHaveBeenCalledWith(MenuSelection, {
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
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
      });

      const updatedSelection = {
        ...existingSelection,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: ['순두부찌개'],
          etc: [],
        },
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(existingSelection),
        save: jest.fn().mockResolvedValue(updatedSelection),
      };

      (mockDataSource.transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          return callback(mockManager);
        },
      );

      const result = await service.createSelection(user, menus);

      expect(result.menuPayload).toEqual({
        breakfast: ['김치찌개'],
        lunch: ['된장찌개'],
        dinner: ['순두부찌개'],
        etc: [],
      });
      expect(mockManager.save).toHaveBeenCalled();
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

      const createdSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        menuRecommendation: recommendation,
      });

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdSelection),
        save: jest.fn().mockResolvedValue(createdSelection),
      };

      (mockDataSource.transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          return callback(mockManager);
        },
      );

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
    });

    it('should deduplicate menus in the same slot', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [
        { slot: 'breakfast', name: '김치찌개' },
        { slot: 'breakfast', name: '김치찌개' },
        { slot: 'breakfast', name: '된장찌개' },
      ];

      const createdSelection = MenuSelectionFactory.create({
        menuPayload: {
          breakfast: ['김치찌개', '된장찌개'],
          lunch: [],
          dinner: [],
          etc: [],
        },
      });

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(createdSelection),
        save: jest.fn().mockResolvedValue(createdSelection),
      };

      (mockDataSource.transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          return callback(mockManager);
        },
      );

      const result = await service.createSelection(user, menus);

      expect(result.menuPayload.breakfast).toEqual(['김치찌개', '된장찌개']);
    });

    it('should reset status to PENDING when merging existing selection', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [{ slot: 'breakfast', name: '김치찌개' }];

      const existingSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        retryCount: 3,
      });

      const updatedSelection = {
        ...existingSelection,
        status: MenuSelectionStatus.PENDING,
        retryCount: 0,
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(existingSelection),
        save: jest.fn().mockResolvedValue(updatedSelection),
      };

      (mockDataSource.transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          return callback(mockManager);
        },
      );

      const result = await service.createSelection(user, menus);

      expect(result.status).toBe(MenuSelectionStatus.PENDING);
      expect(result.retryCount).toBe(0);
    });

    it('should link to menu recommendation when merging existing selection with historyId', async () => {
      const user = UserFactory.create({ id: 1 });
      const menus = [{ slot: 'breakfast', name: '김치찌개' }];
      const historyId = 10;

      const existingSelection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: {
          breakfast: [],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
      });

      const recommendation = MenuRecommendationFactory.create({
        id: historyId,
        user,
      });

      mockMenuRecommendationService.findOwnedRecommendation.mockResolvedValue(
        recommendation,
      );

      const updatedSelection = {
        ...existingSelection,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
        menuRecommendation: recommendation,
      };

      const mockManager = {
        findOne: jest.fn().mockResolvedValue(existingSelection),
        save: jest.fn().mockResolvedValue(updatedSelection),
      };

      (mockDataSource.transaction as jest.Mock).mockImplementation(
        async (callback: any) => {
          return callback(mockManager);
        },
      );

      const result = await service.createSelection(user, menus, historyId);

      expect(
        mockMenuRecommendationService.findOwnedRecommendation,
      ).toHaveBeenCalledWith(historyId, user);
      expect(result.menuPayload).toEqual({
        breakfast: ['김치찌개'],
        lunch: ['된장찌개'],
        dinner: [],
        etc: [],
      });
    });
  });

  describe('updateSelection', () => {
    it('should update selection with new menu data', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
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

      await service.updateSelection(user, 1, updateDto);

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
        retryCount: 0,
      });
    });

    it('should cancel selection when cancel flag is true', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.IN_PROGRESS,
      });

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
    });

    it('should throw BadRequestException when no slot is updated', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
      });

      mockMenuSelectionRepository.findOne.mockResolvedValue(selection);

      await expect(service.updateSelection(user, 1, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should filter out empty menu names when updating', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.CANCELLED,
      });

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
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
      });

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
    });

    it('should update lunch slot correctly', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: [],
          etc: [],
        },
      });

      const updateDto = {
        lunch: ['불고기', '비빔밥'],
      };

      mockMenuSelectionRepository.findOne
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce({
          ...selection,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: ['불고기', '비빔밥'],
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
          breakfast: ['김치찌개'],
          lunch: ['불고기', '비빔밥'],
          dinner: [],
          etc: [],
        },
        status: MenuSelectionStatus.PENDING,
        selectedAt: expect.any(Date),
        selectedDate: expect.any(String),
        retryCount: 0,
      });
      expect(result.menuPayload.lunch).toEqual(['불고기', '비빔밥']);
    });

    it('should update dinner slot correctly', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.FAILED,
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: ['김치찌개'],
          etc: [],
        },
      });

      const updateDto = {
        dinner: ['순두부찌개', '삼겹살'],
      };

      mockMenuSelectionRepository.findOne
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce({
          ...selection,
          menuPayload: {
            breakfast: [],
            lunch: [],
            dinner: ['순두부찌개', '삼겹살'],
            etc: [],
          },
        });

      mockMenuSelectionRepository.update.mockResolvedValue({
        affected: 1,
      } as any);

      const result = await service.updateSelection(user, 1, updateDto);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(1, {
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: ['순두부찌개', '삼겹살'],
          etc: [],
        },
        status: MenuSelectionStatus.PENDING,
        selectedAt: expect.any(Date),
        selectedDate: expect.any(String),
        retryCount: 0,
      });
      expect(result.menuPayload.dinner).toEqual(['순두부찌개', '삼겹살']);
    });

    it('should update etc slot correctly', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: ['간식'],
        },
      });

      const updateDto = {
        etc: ['커피', '케이크'],
      };

      mockMenuSelectionRepository.findOne
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce({
          ...selection,
          menuPayload: {
            breakfast: [],
            lunch: [],
            dinner: [],
            etc: ['커피', '케이크'],
          },
        });

      mockMenuSelectionRepository.update.mockResolvedValue({
        affected: 1,
      } as any);

      const result = await service.updateSelection(user, 1, updateDto);

      expect(mockMenuSelectionRepository.update).toHaveBeenCalledWith(1, {
        menuPayload: {
          breakfast: [],
          lunch: [],
          dinner: [],
          etc: ['커피', '케이크'],
        },
        status: MenuSelectionStatus.PENDING,
        selectedAt: expect.any(Date),
        selectedDate: expect.any(String),
        retryCount: 0,
      });
      expect(result.menuPayload.etc).toEqual(['커피', '케이크']);
    });

    it('should update multiple slots at once', async () => {
      const user = UserFactory.create({ id: 1 });
      const selection = MenuSelectionFactory.create({
        id: 1,
        user,
        status: MenuSelectionStatus.CANCELLED,
        menuPayload: {
          breakfast: ['김치찌개'],
          lunch: ['된장찌개'],
          dinner: ['순두부찌개'],
          etc: [],
        },
      });

      const updateDto = {
        lunch: ['불고기'],
        dinner: ['삼겹살'],
        etc: ['커피'],
      };

      mockMenuSelectionRepository.findOne
        .mockResolvedValueOnce(selection)
        .mockResolvedValueOnce({
          ...selection,
          menuPayload: {
            breakfast: ['김치찌개'],
            lunch: ['불고기'],
            dinner: ['삼겹살'],
            etc: ['커피'],
          },
        });

      mockMenuSelectionRepository.update.mockResolvedValue({
        affected: 1,
      } as any);

      const result = await service.updateSelection(user, 1, updateDto);

      expect(result.menuPayload).toEqual({
        breakfast: ['김치찌개'],
        lunch: ['불고기'],
        dinner: ['삼겹살'],
        etc: ['커피'],
      });
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

    it('should normalize invalid menuPayload structure to etc slot', async () => {
      const user = UserFactory.create({ id: 1 });
      const selectionWithInvalidPayload = {
        ...MenuSelectionFactory.create({ id: 1, user }),

        menuPayload: { name: '김치찌개' } as any,
      };

      mockMenuSelectionRepository.find.mockResolvedValue([
        selectionWithInvalidPayload,
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
