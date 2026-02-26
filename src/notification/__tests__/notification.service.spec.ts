import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { User } from '@/user/entities/user.entity';
import { NotificationListQueryDto } from '../dto/notification-list-query.dto';
import { Notification } from '../entities/notification.entity';
import { NotificationStatus } from '../enum/notification-status.enum';
import { NotificationType } from '../enum/notification-type.enum';
import { NotificationService } from '../notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let repository: jest.Mocked<Repository<Notification>>;

  const mockUser: User = {
    id: 1,
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'ADMIN',
  } as User;

  const mockNotification: Notification = {
    id: 1,
    type: NotificationType.NOTICE,
    title: 'Test Notification',
    content: 'Test Content',
    status: NotificationStatus.DRAFT,
    isPinned: false,
    viewCount: 0,
    scheduledAt: null,
    publishedAt: null,
    createdBy: mockUser,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
  };

  beforeEach(async () => {
    const mockRepository: jest.Mocked<Partial<Repository<Notification>>> = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      increment: jest.fn(),
      softRemove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    repository = module.get(getRepositoryToken(Notification));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create service instance when all dependencies are injected', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create notification with default DRAFT status when status is not provided', async () => {
      const createDto = {
        type: NotificationType.NOTICE,
        title: 'New Notification',
        content: 'Content',
      };

      const createdNotification = {
        ...mockNotification,
        status: NotificationStatus.DRAFT,
        publishedAt: null,
      };

      repository.create.mockReturnValue(createdNotification);
      repository.save.mockResolvedValue(createdNotification);

      const result = await service.create(createDto, mockUser);

      expect(repository.create).toHaveBeenCalledWith({
        type: createDto.type,
        title: createDto.title,
        content: createDto.content,
        status: NotificationStatus.DRAFT,
        isPinned: false,
        scheduledAt: null,
        publishedAt: null,
        createdBy: mockUser,
      });
      expect(result.status).toBe(NotificationStatus.DRAFT);
      expect(result.publishedAt).toBeNull();
    });

    it('should set publishedAt when status is PUBLISHED', async () => {
      const createDto = {
        type: NotificationType.NOTICE,
        title: 'Published Notification',
        content: 'Content',
        status: NotificationStatus.PUBLISHED,
      };

      const createdNotification = {
        ...mockNotification,
        status: NotificationStatus.PUBLISHED,
        publishedAt: new Date(),
      };

      repository.create.mockReturnValue(createdNotification);
      repository.save.mockResolvedValue(createdNotification);

      const result = await service.create(createDto, mockUser);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      );
      expect(result.publishedAt).toBeTruthy();
    });

    it('should not set publishedAt when status is DRAFT', async () => {
      const createDto = {
        type: NotificationType.NOTICE,
        title: 'Draft Notification',
        content: 'Content',
        status: NotificationStatus.DRAFT,
      };

      const createdNotification = {
        ...mockNotification,
        status: NotificationStatus.DRAFT,
        publishedAt: null,
      };

      repository.create.mockReturnValue(createdNotification);
      repository.save.mockResolvedValue(createdNotification);

      await service.create(createDto, mockUser);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          publishedAt: null,
        }),
      );
    });

    it('should set isPinned when provided', async () => {
      const createDto = {
        type: NotificationType.NOTICE,
        title: 'Pinned Notification',
        content: 'Content',
        isPinned: true,
      };

      const createdNotification = { ...mockNotification, isPinned: true };

      repository.create.mockReturnValue(createdNotification);
      repository.save.mockResolvedValue(createdNotification);

      await service.create(createDto, mockUser);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isPinned: true,
        }),
      );
    });

    it('should convert scheduledAt string to Date when provided', async () => {
      const scheduledDate = '2024-12-31T23:59:59.000Z';
      const createDto = {
        type: NotificationType.NOTICE,
        title: 'Scheduled Notification',
        content: 'Content',
        scheduledAt: scheduledDate,
      };

      const createdNotification = {
        ...mockNotification,
        scheduledAt: new Date(scheduledDate),
      };

      repository.create.mockReturnValue(createdNotification);
      repository.save.mockResolvedValue(createdNotification);

      await service.create(createDto, mockUser);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledAt: expect.any(Date),
        }),
      );
    });
  });

  describe('findAllAdmin', () => {
    it('should return paginated notifications with default pagination when no query params provided', async () => {
      const queryDto: NotificationListQueryDto = {};
      const notifications = [mockNotification];

      const mockQb = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([notifications, 1]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(mockQb) as any;

      const result = await service.findAllAdmin(queryDto);

      expect(result.items).toEqual(notifications);
      expect(result.pageInfo).toEqual({
        page: 1,
        limit: 20,
        totalCount: 1,
        hasNext: false,
      });
    });

    it('should filter by status when status is provided', async () => {
      const queryDto: NotificationListQueryDto = {
        status: NotificationStatus.PUBLISHED,
      };

      const mockQb = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(mockQb) as any;

      await service.findAllAdmin(queryDto);

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'notification.status = :status',
        { status: NotificationStatus.PUBLISHED },
      );
    });

    it('should filter by type when type is provided', async () => {
      const queryDto: NotificationListQueryDto = {
        type: NotificationType.EVENT,
      };

      const mockQb = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(mockQb) as any;

      await service.findAllAdmin(queryDto);

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'notification.type = :type',
        { type: NotificationType.EVENT },
      );
    });

    it('should calculate hasNext as true when more items exist', async () => {
      const queryDto: NotificationListQueryDto = { page: 1, limit: 10 };
      const notifications = Array(10).fill(mockNotification);

      const mockQb = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([notifications, 25]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(mockQb) as any;

      const result = await service.findAllAdmin(queryDto);

      expect(result.pageInfo.hasNext).toBe(true);
    });

    it('should calculate hasNext as false when no more items exist', async () => {
      const queryDto: NotificationListQueryDto = { page: 1, limit: 10 };
      const notifications = Array(5).fill(mockNotification);

      const mockQb = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([notifications, 5]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(mockQb) as any;

      const result = await service.findAllAdmin(queryDto);

      expect(result.pageInfo.hasNext).toBe(false);
    });

    it('should return empty array when no notifications exist', async () => {
      const queryDto: NotificationListQueryDto = {};

      const mockQb = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      repository.createQueryBuilder = jest.fn().mockReturnValue(mockQb) as any;

      const result = await service.findAllAdmin(queryDto);

      expect(result.items).toEqual([]);
      expect(result.pageInfo.totalCount).toBe(0);
    });
  });

  describe('findOneAdmin', () => {
    it('should return notification when notification exists', async () => {
      repository.findOne.mockResolvedValue(mockNotification);

      const result = await service.findOneAdmin(1);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['createdBy'],
      });
      expect(result).toEqual(mockNotification);
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOneAdmin(999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOneAdmin(999)).rejects.toThrow(
        '공지사항을 찾을 수 없습니다. (ID: 999)',
      );
    });
  });

  describe('update', () => {
    it('should update notification fields when provided', async () => {
      const updateDto = {
        title: 'Updated Title',
        content: 'Updated Content',
      };

      const updatedNotification = {
        ...mockNotification,
        title: updateDto.title,
        content: updateDto.content,
      };

      repository.findOne.mockResolvedValue(mockNotification);
      repository.save.mockResolvedValue(updatedNotification);

      const result = await service.update(1, updateDto);

      expect(result.title).toBe(updateDto.title);
      expect(result.content).toBe(updateDto.content);
    });

    it('should set publishedAt when status changes to PUBLISHED', async () => {
      const updateDto = {
        status: NotificationStatus.PUBLISHED,
      };

      const notificationWithoutPublishedAt = {
        ...mockNotification,
        status: NotificationStatus.DRAFT,
        publishedAt: null,
      };

      repository.findOne.mockResolvedValue(notificationWithoutPublishedAt);
      repository.save.mockResolvedValue({
        ...notificationWithoutPublishedAt,
        status: NotificationStatus.PUBLISHED,
        publishedAt: new Date(),
      });

      const result = await service.update(1, updateDto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      );
    });

    it('should not update publishedAt when already set', async () => {
      const existingPublishedAt = new Date('2024-01-01T00:00:00.000Z');
      const updateDto = {
        status: NotificationStatus.PUBLISHED,
      };

      const notificationWithPublishedAt = {
        ...mockNotification,
        status: NotificationStatus.PUBLISHED,
        publishedAt: existingPublishedAt,
      };

      repository.findOne.mockResolvedValue(notificationWithPublishedAt);
      repository.save.mockResolvedValue(notificationWithPublishedAt);

      await service.update(1, updateDto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          publishedAt: existingPublishedAt,
        }),
      );
    });

    it('should update type when provided', async () => {
      const updateDto = {
        type: NotificationType.EVENT,
      };

      repository.findOne.mockResolvedValue(mockNotification);
      repository.save.mockResolvedValue({
        ...mockNotification,
        type: NotificationType.EVENT,
      });

      await service.update(1, updateDto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.EVENT,
        }),
      );
    });

    it('should update isPinned when provided', async () => {
      const updateDto = {
        isPinned: true,
      };

      repository.findOne.mockResolvedValue(mockNotification);
      repository.save.mockResolvedValue({
        ...mockNotification,
        isPinned: true,
      });

      await service.update(1, updateDto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isPinned: true,
        }),
      );
    });

    it('should update scheduledAt when provided', async () => {
      const scheduledDate = '2024-12-31T23:59:59.000Z';
      const updateDto = {
        scheduledAt: scheduledDate,
      };

      repository.findOne.mockResolvedValue(mockNotification);
      repository.save.mockResolvedValue({
        ...mockNotification,
        scheduledAt: new Date(scheduledDate),
      });

      await service.update(1, updateDto);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledAt: expect.any(Date),
        }),
      );
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      const updateDto = { title: 'Updated Title' };

      repository.findOne.mockResolvedValue(null);

      await expect(service.update(999, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('softDelete', () => {
    it('should soft delete notification when notification exists', async () => {
      repository.findOne.mockResolvedValue(mockNotification);
      repository.softRemove.mockResolvedValue(mockNotification);

      await service.softDelete(1);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['createdBy'],
      });
      expect(repository.softRemove).toHaveBeenCalledWith(mockNotification);
    });

    it('should throw NotFoundException when notification does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.softDelete(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('publishScheduledNotifications', () => {
    it('should return 0 when no scheduled notifications exist', async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.publishScheduledNotifications();

      expect(result).toBe(0);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should update SCHEDULED to PUBLISHED when scheduledAt has passed', async () => {
      const pastDate = new Date('2024-01-01T00:00:00.000Z');
      const scheduledNotifications = [
        {
          ...mockNotification,
          status: NotificationStatus.SCHEDULED,
          scheduledAt: pastDate,
        },
      ];

      repository.find.mockResolvedValue(scheduledNotifications);
      (repository.save as jest.Mock).mockResolvedValue(scheduledNotifications);

      await service.publishScheduledNotifications();

      expect(repository.find).toHaveBeenCalledWith({
        where: {
          status: NotificationStatus.SCHEDULED,
          scheduledAt: LessThanOrEqual(expect.any(Date)),
        },
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            status: NotificationStatus.PUBLISHED,
            publishedAt: expect.any(Date),
          }),
        ]),
      );
    });

    it('should set publishedAt when publishing scheduled notifications', async () => {
      const pastDate = new Date('2024-01-01T00:00:00.000Z');
      const scheduledNotifications = [
        {
          ...mockNotification,
          status: NotificationStatus.SCHEDULED,
          scheduledAt: pastDate,
          publishedAt: null,
        },
      ];

      repository.find.mockResolvedValue(scheduledNotifications);
      (repository.save as jest.Mock).mockResolvedValue(scheduledNotifications);

      await service.publishScheduledNotifications();

      expect(repository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            publishedAt: expect.any(Date),
          }),
        ]),
      );
    });

    it('should return count of published notifications', async () => {
      const scheduledNotifications = [
        {
          ...mockNotification,
          id: 1,
          status: NotificationStatus.SCHEDULED,
          scheduledAt: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          ...mockNotification,
          id: 2,
          status: NotificationStatus.SCHEDULED,
          scheduledAt: new Date('2024-01-02T00:00:00.000Z'),
        },
        {
          ...mockNotification,
          id: 3,
          status: NotificationStatus.SCHEDULED,
          scheduledAt: new Date('2024-01-03T00:00:00.000Z'),
        },
      ];

      repository.find.mockResolvedValue(scheduledNotifications);
      (repository.save as jest.Mock).mockResolvedValue(scheduledNotifications);

      const result = await service.publishScheduledNotifications();

      expect(result).toBe(3);
    });

    it('should handle multiple scheduled notifications at once', async () => {
      const pastDate = new Date('2024-01-01T00:00:00.000Z');
      const scheduledNotifications = Array(5)
        .fill(null)
        .map((_, index) => ({
          ...mockNotification,
          id: index + 1,
          status: NotificationStatus.SCHEDULED,
          scheduledAt: pastDate,
        }));

      repository.find.mockResolvedValue(scheduledNotifications);
      (repository.save as jest.Mock).mockResolvedValue(scheduledNotifications);

      const result = await service.publishScheduledNotifications();

      expect(result).toBe(5);
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith(
        expect.arrayContaining(
          scheduledNotifications.map(() =>
            expect.objectContaining({
              status: NotificationStatus.PUBLISHED,
              publishedAt: expect.any(Date),
            }),
          ),
        ),
      );
    });
  });
});
