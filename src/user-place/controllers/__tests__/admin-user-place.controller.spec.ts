import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { AdminUserPlaceController } from '../admin-user-place.controller';
import { AdminUserPlaceService } from '../../services/admin-user-place.service';
import { AdminUserPlaceStatsService } from '../../services/admin-user-place-stats.service';
import { UserService } from '@/user/user.service';
import { createMockService } from '../../../../test/utils/test-helpers';
import { UserFactory } from '../../../../test/factories/entity.factory';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import { UpdateUserPlaceByAdminDto } from '../../dto/update-user-place-by-admin.dto';
import { UserPlaceStatus } from '../../enum/user-place-status.enum';

// Mock UserPlace factory for controller tests
const createMockUserPlace = (overrides = {}) =>
  ({
    id: 1,
    user: { id: 1 },
    name: '맛있는 식당',
    address: '서울특별시 강남구 테헤란로 123',
    latitude: 37.5012345,
    longitude: 127.0398765,
    location: {
      type: 'Point',
      coordinates: [127.0398765, 37.5012345],
    },
    menuTypes: ['한식', '찌개류'],
    photos: null,
    openingHours: null,
    phoneNumber: '02-1234-5678',
    category: '한식',
    description: '맛있는 한식집입니다',
    status: UserPlaceStatus.APPROVED,
    rejectionReason: null,
    rejectionCount: 0,
    lastRejectedAt: null,
    lastSubmittedAt: new Date(),
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  }) as any;

describe('AdminUserPlaceController', () => {
  let controller: AdminUserPlaceController;
  let userPlaceService: jest.Mocked<AdminUserPlaceService>;
  let userPlaceStatsService: jest.Mocked<AdminUserPlaceStatsService>;
  let userService: jest.Mocked<UserService>;

  const adminUser: AuthUserPayload = {
    sub: 1,
    email: 'admin@example.com',
    role: 'SUPER_ADMIN',
  };

  const mockRequest = {
    ip: '192.168.1.1',
    headers: {},
    socket: { remoteAddress: '192.168.1.1' },
  } as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();
    userPlaceService = createMockService<AdminUserPlaceService>([
      'approvePlace',
      'rejectPlace',
      'updatePlaceByAdmin',
    ]);
    userPlaceStatsService = createMockService<AdminUserPlaceStatsService>([
      'findAllForAdmin',
      'findOneForAdmin',
    ]);
    userService = createMockService<UserService>(['findByEmail']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUserPlaceController],
      providers: [
        {
          provide: AdminUserPlaceService,
          useValue: userPlaceService,
        },
        {
          provide: AdminUserPlaceStatsService,
          useValue: userPlaceStatsService,
        },
        {
          provide: UserService,
          useValue: userService,
        },
      ],
    }).compile();

    controller = module.get<AdminUserPlaceController>(AdminUserPlaceController);
  });

  it('should create controller instance when service dependencies are injected', () => {
    expect(controller).toBeDefined();
  });

  describe('update', () => {
    const placeId = 1;

    it('should update APPROVED place successfully', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {
        name: '업데이트된 식당',
        address: '업데이트된 주소',
      };
      const updatedPlace = createMockUserPlace({
        id: placeId,
        name: dto.name,
        address: dto.address,
        status: UserPlaceStatus.APPROVED,
      });

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(updatedPlace);

      // Act
      const result = await controller.update(
        placeId,
        dto,
        [],
        adminUser,
        mockRequest,
      );

      // Assert
      expect(userService.findByEmail).toHaveBeenCalledWith(adminUser.email);
      expect(userPlaceService.updatePlaceByAdmin).toHaveBeenCalledWith(
        placeId,
        adminEntity.id,
        dto,
        '192.168.1.1',
        [],
      );
      expect(result).toEqual(updatedPlace);
      expect(result.name).toBe(dto.name);
      expect(result.address).toBe(dto.address);
    });

    it('should update place with partial fields', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {
        name: '이름만 업데이트',
      };
      const updatedPlace = createMockUserPlace({
        id: placeId,
        name: dto.name,
        status: UserPlaceStatus.APPROVED,
      });

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(updatedPlace);

      // Act
      const result = await controller.update(
        placeId,
        dto,
        [],
        adminUser,
        mockRequest,
      );

      // Assert
      expect(userPlaceService.updatePlaceByAdmin).toHaveBeenCalledWith(
        placeId,
        adminEntity.id,
        dto,
        '192.168.1.1',
        [],
      );
      expect(result.name).toBe(dto.name);
    });

    it('should throw NotFoundException when admin user is not found', async () => {
      // Arrange
      const dto: UpdateUserPlaceByAdminDto = {
        name: '업데이트된 식당',
      };

      userService.findByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(
        controller.update(placeId, dto, [], adminUser, mockRequest),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.update(placeId, dto, [], adminUser, mockRequest),
      ).rejects.toThrow('ADMIN_USER_NOT_FOUND');
      expect(userPlaceService.updatePlaceByAdmin).not.toHaveBeenCalled();
    });

    it('should extract IP from x-forwarded-for header', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {
        name: '업데이트된 식당',
      };
      const updatedPlace = createMockUserPlace({
        id: placeId,
        name: dto.name,
        status: UserPlaceStatus.APPROVED,
      });

      const requestWithForwarded = {
        ...mockRequest,
        headers: {
          'x-forwarded-for': '10.0.0.1, 192.168.1.1',
        },
      } as unknown as Request;

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(updatedPlace);

      // Act
      await controller.update(
        placeId,
        dto,
        [],
        adminUser,
        requestWithForwarded,
      );

      // Assert
      expect(userPlaceService.updatePlaceByAdmin).toHaveBeenCalledWith(
        placeId,
        adminEntity.id,
        dto,
        '10.0.0.1', // First IP from x-forwarded-for
        [],
      );
    });

    it('should extract IP from x-forwarded-for array', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {
        name: '업데이트된 식당',
      };
      const updatedPlace = createMockUserPlace({
        id: placeId,
        name: dto.name,
        status: UserPlaceStatus.APPROVED,
      });

      const requestWithForwardedArray = {
        ...mockRequest,
        headers: {
          'x-forwarded-for': ['10.0.0.2', '192.168.1.2'],
        },
      } as unknown as Request;

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(updatedPlace);

      // Act
      await controller.update(
        placeId,
        dto,
        [],
        adminUser,
        requestWithForwardedArray,
      );

      // Assert
      expect(userPlaceService.updatePlaceByAdmin).toHaveBeenCalledWith(
        placeId,
        adminEntity.id,
        dto,
        '10.0.0.2', // First IP from array
        [],
      );
    });

    it('should fallback to req.ip when x-forwarded-for is not present', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {
        name: '업데이트된 식당',
      };
      const updatedPlace = createMockUserPlace({
        id: placeId,
        name: dto.name,
        status: UserPlaceStatus.APPROVED,
      });

      const requestWithoutForwarded = {
        ip: '203.0.113.1',
        headers: {},
        socket: { remoteAddress: '203.0.113.1' },
      } as unknown as Request;

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(updatedPlace);

      // Act
      await controller.update(
        placeId,
        dto,
        [],
        adminUser,
        requestWithoutForwarded,
      );

      // Assert
      expect(userPlaceService.updatePlaceByAdmin).toHaveBeenCalledWith(
        placeId,
        adminEntity.id,
        dto,
        '203.0.113.1',
        [],
      );
    });

    it('should update all updateable fields when provided', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {
        name: '완전히 업데이트된 식당',
        address: '서울특별시 서초구 강남대로 456',
        latitude: 37.4912345,
        longitude: 127.0298765,
        menuTypes: ['중식', '일식', '양식'],
        existingPhotos: [
          'https://s3.amazonaws.com/photo1.jpg',
          'https://s3.amazonaws.com/photo2.jpg',
        ],
        openingHours: '평일: 11:00-22:00, 주말: 10:00-23:00',
        phoneNumber: '02-8888-9999',
        category: '중식',
        description: '완전히 새로운 설명입니다',
      };
      const updatedPlace = createMockUserPlace({
        id: placeId,
        name: dto.name,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        menuTypes: dto.menuTypes,
        photos: dto.existingPhotos,
        openingHours: dto.openingHours,
        phoneNumber: dto.phoneNumber,
        category: dto.category,
        description: dto.description,
        status: UserPlaceStatus.APPROVED,
      });

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(updatedPlace);

      // Act
      const result = await controller.update(
        placeId,
        dto,
        [],
        adminUser,
        mockRequest,
      );

      // Assert
      expect(result.name).toBe(dto.name);
      expect(result.address).toBe(dto.address);
      expect(result.latitude).toBe(dto.latitude);
      expect(result.longitude).toBe(dto.longitude);
      expect(result.menuTypes).toEqual(dto.menuTypes);
      expect(result.photos).toEqual(dto.existingPhotos);
      expect(result.openingHours).toBe(dto.openingHours);
      expect(result.phoneNumber).toBe(dto.phoneNumber);
      expect(result.category).toBe(dto.category);
      expect(result.description).toBe(dto.description);
    });

    it('should handle empty dto object', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {};
      const originalPlace = createMockUserPlace({
        id: placeId,
        status: UserPlaceStatus.APPROVED,
      });

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(originalPlace);

      // Act
      const result = await controller.update(
        placeId,
        dto,
        [],
        adminUser,
        mockRequest,
      );

      // Assert
      expect(userPlaceService.updatePlaceByAdmin).toHaveBeenCalledWith(
        placeId,
        adminEntity.id,
        dto,
        '192.168.1.1',
        [],
      );
      expect(result).toEqual(originalPlace);
    });

    it('should allow updating only coordinates without other fields', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {
        latitude: 37.6012345,
        longitude: 127.1398765,
      };
      const updatedPlace = createMockUserPlace({
        id: placeId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        location: {
          type: 'Point',
          coordinates: [dto.longitude, dto.latitude],
        },
        status: UserPlaceStatus.APPROVED,
      });

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(updatedPlace);

      // Act
      const result = await controller.update(
        placeId,
        dto,
        [],
        adminUser,
        mockRequest,
      );

      // Assert
      expect(result.latitude).toBe(dto.latitude);
      expect(result.longitude).toBe(dto.longitude);
    });

    it('should use unknown as IP when all IP sources are unavailable', async () => {
      // Arrange
      const adminEntity = UserFactory.create({
        id: 999,
        email: adminUser.email,
      });
      const dto: UpdateUserPlaceByAdminDto = {
        name: '업데이트된 식당',
      };
      const updatedPlace = createMockUserPlace({
        id: placeId,
        name: dto.name,
        status: UserPlaceStatus.APPROVED,
      });

      const requestWithoutIp = {
        headers: {},
        socket: {},
      } as unknown as Request;

      userService.findByEmail.mockResolvedValue(adminEntity);
      userPlaceService.updatePlaceByAdmin.mockResolvedValue(updatedPlace);

      // Act
      await controller.update(placeId, dto, [], adminUser, requestWithoutIp);

      // Assert
      expect(userPlaceService.updatePlaceByAdmin).toHaveBeenCalledWith(
        placeId,
        adminEntity.id,
        dto,
        'unknown',
        [],
      );
    });
  });
});
