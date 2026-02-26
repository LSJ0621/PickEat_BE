import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { AdminNotificationController } from '../../controllers/admin-notification.controller';
import { NotificationService } from '../../notification.service';
import { UserService } from '@/user/user.service';
import { CreateNotificationDto } from '../../dto/create-notification.dto';
import { NotificationListQueryDto } from '../../dto/notification-list-query.dto';
import { UpdateNotificationDto } from '../../dto/update-notification.dto';
import { NotificationStatus } from '../../enum/notification-status.enum';
import { NotificationType } from '../../enum/notification-type.enum';
import { MessageCode } from '@/common/constants/message-codes';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';

describe('AdminNotificationController', () => {
  let controller: AdminNotificationController;
  let notificationService: jest.Mocked<NotificationService>;
  let userService: jest.Mocked<UserService>;

  const mockAdminUser = UserFactory.createAdmin('admin@example.com');

  const mockAuthUser: AuthUserPayload = {
    sub: 99,
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  const mockNotification = {
    id: 1,
    type: NotificationType.NOTICE,
    title: '공지사항 제목',
    content: '공지사항 내용입니다.',
    status: NotificationStatus.DRAFT,
    isPinned: false,
    scheduledAt: null,
    publishedAt: null,
    createdBy: mockAdminUser,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockNotificationService = {
      create: jest.fn(),
      findAllAdmin: jest.fn(),
      findOneAdmin: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const mockUserService = {
      findByEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNotificationController],
      providers: [
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<AdminNotificationController>(
      AdminNotificationController,
    );
    notificationService = module.get(NotificationService);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create controller instance when service dependencies are injected', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create notification and return result when admin user is found', async () => {
      const dto: CreateNotificationDto = {
        type: NotificationType.NOTICE,
        title: '공지사항 제목',
        content: '공지사항 내용입니다.',
        status: NotificationStatus.DRAFT,
      };

      userService.findByEmail.mockResolvedValue(mockAdminUser);
      notificationService.create.mockResolvedValue(mockNotification as never);

      const result = await controller.create(dto, mockAuthUser);

      expect(userService.findByEmail).toHaveBeenCalledWith(mockAuthUser.email);
      expect(notificationService.create).toHaveBeenCalledWith(
        dto,
        mockAdminUser,
      );
      expect(result).toEqual(mockNotification);
    });

    it('should throw NotFoundException when admin user is not found', async () => {
      const dto: CreateNotificationDto = {
        type: NotificationType.NOTICE,
        title: '공지사항 제목',
        content: '공지사항 내용입니다.',
      };

      userService.findByEmail.mockResolvedValue(null);

      await expect(controller.create(dto, mockAuthUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(notificationService.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated notifications when valid query is provided', async () => {
      const queryDto: NotificationListQueryDto = { page: 1, limit: 20 };
      const expectedResult = {
        items: [mockNotification],
        pageInfo: { page: 1, limit: 20, totalCount: 1, hasNext: false },
      };

      notificationService.findAllAdmin.mockResolvedValue(
        expectedResult as never,
      );

      const result = await controller.findAll(queryDto);

      expect(notificationService.findAllAdmin).toHaveBeenCalledWith(queryDto);
      expect(result).toEqual(expectedResult);
    });

    it('should return empty list when no notifications exist', async () => {
      const queryDto: NotificationListQueryDto = { page: 1, limit: 20 };
      const expectedResult = {
        items: [],
        pageInfo: { page: 1, limit: 20, totalCount: 0, hasNext: false },
      };

      notificationService.findAllAdmin.mockResolvedValue(
        expectedResult as never,
      );

      const result = await controller.findAll(queryDto);

      expect(result).toEqual(expectedResult);
    });
  });

  describe('findOne', () => {
    it('should return notification when valid id is provided', async () => {
      notificationService.findOneAdmin.mockResolvedValue(
        mockNotification as never,
      );

      const result = await controller.findOne(1);

      expect(notificationService.findOneAdmin).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockNotification);
    });

    it('should propagate NotFoundException when notification is not found', async () => {
      notificationService.findOneAdmin.mockRejectedValue(
        new NotFoundException('공지사항을 찾을 수 없습니다.'),
      );

      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update notification and return updated result when valid data is provided', async () => {
      const dto: UpdateNotificationDto = {
        title: '수정된 제목',
        status: NotificationStatus.PUBLISHED,
      };
      const updatedNotification = {
        ...mockNotification,
        title: '수정된 제목',
        status: NotificationStatus.PUBLISHED,
        publishedAt: new Date(),
      };

      notificationService.update.mockResolvedValue(
        updatedNotification as never,
      );

      const result = await controller.update(1, dto);

      expect(notificationService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toEqual(updatedNotification);
    });
  });

  describe('remove', () => {
    it('should soft delete notification and return message code when valid id is provided', async () => {
      notificationService.softDelete.mockResolvedValue(undefined);

      const result = await controller.remove(1);

      expect(notificationService.softDelete).toHaveBeenCalledWith(1);
      expect(result).toEqual({
        messageCode: MessageCode.NOTIFICATION_DELETED,
      });
    });

    it('should propagate NotFoundException when notification to delete is not found', async () => {
      notificationService.softDelete.mockRejectedValue(
        new NotFoundException('공지사항을 찾을 수 없습니다.'),
      );

      await expect(controller.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
