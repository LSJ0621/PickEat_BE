import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { USER_PLACE } from '@/common/constants/business.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { AUDIT_ACTIONS } from '@/admin/settings/constants/audit-action.constants';
import { AdminAuditLog } from '@/admin/settings/entities/admin-audit-log.entity';
import { createMockRepository } from '../../test/mocks/repository.mock';
import { createMockS3Client } from '../../test/mocks/external-clients.mock';
import { UserFactory } from '../../test/factories/entity.factory';
import { S3Client } from '@/external/aws/clients/s3.client';
import { UserPlace } from './entities/user-place.entity';
import { UserPlaceRejectionHistory } from './entities/user-place-rejection-history.entity';
import { UserPlaceStatus } from './enum/user-place-status.enum';
import { UserPlaceService } from './user-place.service';
import { CheckRegistrationDto } from './dto/check-registration.dto';
import { CreateUserPlaceDto } from './dto/create-user-place.dto';
import { UpdateUserPlaceDto } from './dto/update-user-place.dto';
import { UserPlaceListQueryDto } from './dto/user-place-list-query.dto';
import { RejectUserPlaceDto } from './dto/reject-user-place.dto';

/**
 * Factory function to create UserPlace entities for testing
 */
class UserPlaceFactory {
  static create(overrides?: Partial<UserPlace>): UserPlace {
    const userPlace = new UserPlace();
    userPlace.id = overrides?.id ?? 1;
    userPlace.user = overrides?.user ?? UserFactory.create();
    userPlace.name = overrides?.name ?? '맛있는 식당';
    userPlace.address = overrides?.address ?? '서울특별시 강남구 테헤란로 123';
    userPlace.latitude = overrides?.latitude ?? 37.5012345;
    userPlace.longitude = overrides?.longitude ?? 127.0398765;
    userPlace.location =
      overrides?.location ??
      ({
        type: 'Point',
        coordinates: [127.0398765, 37.5012345],
      } as any);
    userPlace.menuTypes = overrides?.menuTypes ?? ['한식', '찌개류'];
    userPlace.photos = overrides?.photos ?? null;
    userPlace.openingHours = overrides?.openingHours ?? null;
    userPlace.phoneNumber = overrides?.phoneNumber ?? '02-1234-5678';
    userPlace.category = overrides?.category ?? '한식';
    userPlace.description = overrides?.description ?? '맛있는 한식집입니다';
    userPlace.status = overrides?.status ?? UserPlaceStatus.PENDING;
    userPlace.rejectionReason = overrides?.rejectionReason ?? null;
    userPlace.rejectionCount = overrides?.rejectionCount ?? 0;
    userPlace.lastRejectedAt = overrides?.lastRejectedAt ?? null;
    userPlace.lastSubmittedAt = overrides?.lastSubmittedAt ?? new Date();
    userPlace.version = overrides?.version ?? 1;
    userPlace.createdAt = overrides?.createdAt ?? new Date();
    userPlace.updatedAt = overrides?.updatedAt ?? new Date();
    return userPlace;
  }

  static createPending(user = UserFactory.create()): UserPlace {
    return UserPlaceFactory.create({ user, status: UserPlaceStatus.PENDING });
  }

  static createApproved(user = UserFactory.create()): UserPlace {
    return UserPlaceFactory.create({ user, status: UserPlaceStatus.APPROVED });
  }

  static createRejected(
    user = UserFactory.create(),
    rejectionReason = '주소가 불명확합니다',
  ): UserPlace {
    return UserPlaceFactory.create({
      user,
      status: UserPlaceStatus.REJECTED,
      rejectionReason,
    });
  }
}

describe('UserPlaceService', () => {
  let service: UserPlaceService;
  let userPlaceRepository: ReturnType<typeof createMockRepository<UserPlace>>;
  let rejectionHistoryRepository: ReturnType<
    typeof createMockRepository<UserPlaceRejectionHistory>
  >;
  let auditLogRepository: ReturnType<
    typeof createMockRepository<AdminAuditLog>
  >;
  let s3Client: ReturnType<typeof createMockS3Client>;
  let mockDataSource: jest.Mocked<DataSource>;

  // Mock QueryBuilder for PostGIS spatial queries
  const createMockQueryBuilder = () => {
    const mockQueryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };
    return mockQueryBuilder;
  };

  // Mock QueryRunner for transaction testing
  const createMockQueryRunner = () => {
    const mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        save: jest.fn(),
        create: jest.fn(),
      },
    };
    return mockQueryRunner;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    userPlaceRepository = createMockRepository<UserPlace>();
    rejectionHistoryRepository =
      createMockRepository<UserPlaceRejectionHistory>();
    auditLogRepository = createMockRepository<AdminAuditLog>();
    s3Client = createMockS3Client();

    const mockQueryRunner = createMockQueryRunner();
    mockDataSource = {
      createQueryRunner: jest.fn(() => mockQueryRunner),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPlaceService,
        {
          provide: getRepositoryToken(UserPlace),
          useValue: userPlaceRepository,
        },
        {
          provide: getRepositoryToken(UserPlaceRejectionHistory),
          useValue: rejectionHistoryRepository,
        },
        {
          provide: getRepositoryToken(AdminAuditLog),
          useValue: auditLogRepository,
        },
        {
          provide: S3Client,
          useValue: s3Client,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<UserPlaceService>(UserPlaceService);
  });

  describe('checkRegistration', () => {
    const userId = 1;
    const dto: CheckRegistrationDto = {
      name: '새로운 식당',
      address: '서울특별시 강남구 테헤란로 456',
      latitude: 37.5012345,
      longitude: 127.0398765,
    };

    it('should return canRegister true when all conditions are met', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      userPlaceRepository.count.mockResolvedValue(0); // No registrations today
      userPlaceRepository.findOne.mockResolvedValue(null); // No duplicate
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.canRegister).toBe(true);
      expect(result.dailyRemaining).toBe(USER_PLACE.DAILY_REGISTRATION_LIMIT);
      expect(result.duplicateExists).toBe(false);
      expect(result.nearbyPlaces).toEqual([]);
    });

    it('should return canRegister false when daily limit is reached', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      userPlaceRepository.count.mockResolvedValue(
        USER_PLACE.DAILY_REGISTRATION_LIMIT,
      );
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.canRegister).toBe(false);
      expect(result.dailyRemaining).toBe(0);
      expect(result.duplicateExists).toBe(false);
    });

    it('should return canRegister false when duplicate exists', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const duplicate = UserPlaceFactory.create({
        user,
        name: dto.name,
        address: dto.address,
      });

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(duplicate);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.canRegister).toBe(false);
      expect(result.duplicateExists).toBe(true);
    });

    it('should return nearby places when they exist within radius', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const nearbyPlace = UserPlaceFactory.create({
        user,
        name: '근처 식당',
        address: '서울특별시 강남구 테헤란로 450',
        latitude: 37.5012345,
        longitude: 127.0398765,
      });

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [nearbyPlace],
        raw: [{ distance: '50.123' }],
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.nearbyPlaces.length).toBeGreaterThan(0);
      expect(result.nearbyPlaces[0]).toMatchObject({
        id: nearbyPlace.id,
        name: nearbyPlace.name,
        address: nearbyPlace.address,
        distance: expect.any(Number),
      });
    });

    it('should filter out places outside radius', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder();
      // PostGIS ST_DWithin filters at database level, so no results returned
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.nearbyPlaces).toEqual([]);
    });

    it('should sort nearby places by distance', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place1 = UserPlaceFactory.create({
        user,
        id: 1,
        latitude: 37.5013,
        longitude: 127.0399,
      });
      const place2 = UserPlaceFactory.create({
        user,
        id: 2,
        latitude: 37.5012,
        longitude: 127.0398,
      });

      const mockQueryBuilder = createMockQueryBuilder();
      // PostGIS query already orders by distance (ORDER BY distance ASC)
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [place2, place1], // Closer place first
        raw: [{ distance: '10.5' }, { distance: '25.8' }],
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      if (result.nearbyPlaces.length > 1) {
        expect(result.nearbyPlaces[0].distance).toBeLessThanOrEqual(
          result.nearbyPlaces[1].distance,
        );
      }
    });
  });

  describe('create', () => {
    const userId = 1;
    const dto: CreateUserPlaceDto = {
      name: '새로운 식당',
      address: '서울특별시 강남구 테헤란로 456',
      latitude: 37.5012345,
      longitude: 127.0398765,
      menuTypes: ['한식', '찌개류', '국밥'],
      phoneNumber: '02-9999-8888',
      category: '한식',
      description: '맛있는 한식집',
    };

    it('should create user place successfully', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const createdPlace = UserPlaceFactory.create({
        user,
        ...dto,
        status: UserPlaceStatus.PENDING,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      const result = await service.create(userId, dto);

      // Assert
      expect(result).toEqual(createdPlace);
      expect(result.status).toBe(UserPlaceStatus.PENDING);
      expect(result.menuTypes).toEqual(dto.menuTypes);
      expect(result.lastSubmittedAt).toBeDefined();
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { id: userId },
          name: dto.name,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          location: expect.objectContaining({
            type: 'Point',
            coordinates: [dto.longitude, dto.latitude],
          }),
          menuTypes: dto.menuTypes,
          phoneNumber: dto.phoneNumber,
          category: dto.category,
          description: dto.description,
          status: UserPlaceStatus.PENDING,
          lastSubmittedAt: expect.any(Date),
        }),
      );
    });

    it('should throw error when daily limit is exceeded', async () => {
      // Arrange
      userPlaceRepository.count.mockResolvedValue(
        USER_PLACE.DAILY_REGISTRATION_LIMIT,
      );

      // Act & Assert
      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(userId, dto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_DAILY_LIMIT_EXCEEDED,
          }),
        }),
      );
    });

    it('should throw error when duplicate exists', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const duplicate = UserPlaceFactory.create({
        user,
        name: dto.name,
        address: dto.address,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(duplicate);

      // Act & Assert
      await expect(service.create(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(userId, dto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_DUPLICATE_REGISTRATION,
          }),
        }),
      );
    });

    it('should create place with null optional fields when not provided', async () => {
      // Arrange
      const minimalDto: CreateUserPlaceDto = {
        name: '식당',
        address: '주소',
        latitude: 37.5,
        longitude: 127.0,
        menuTypes: ['한식'],
      };
      const user = UserFactory.create({ id: userId });
      const createdPlace = UserPlaceFactory.create({
        user,
        ...minimalDto,
        phoneNumber: null,
        category: null,
        description: null,
        photos: null,
        openingHours: null,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      await service.create(userId, minimalDto);

      // Assert
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumber: null,
          category: null,
          description: null,
          photos: null,
          openingHours: null,
        }),
      );
    });

    it('should set lastSubmittedAt when creating place', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const createdPlace = UserPlaceFactory.create({ user, ...dto });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      await service.create(userId, dto);

      // Assert
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSubmittedAt: expect.any(Date),
        }),
      );
    });

    it('should create location point from latitude and longitude', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const createdPlace = UserPlaceFactory.create({ user, ...dto });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      await service.create(userId, dto);

      // Assert
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          location: {
            type: 'Point',
            coordinates: [dto.longitude, dto.latitude], // GeoJSON order: [lng, lat]
          },
        }),
      );
    });

    it('should create place with openingHours when provided', async () => {
      // Arrange
      const dtoWithHours: CreateUserPlaceDto = {
        ...dto,
        openingHours: '월-금: 11:00-22:00, 주말: 12:00-21:00',
      };
      const user = UserFactory.create({ id: userId });
      const createdPlace = UserPlaceFactory.create({
        user,
        ...dtoWithHours,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      await service.create(userId, dtoWithHours);

      // Assert
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          openingHours: dtoWithHours.openingHours,
        }),
      );
    });

    it('should create user place with uploaded images', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'restaurant1.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake-image-1'),
          size: 1024,
        } as Express.Multer.File,
        {
          fieldname: 'images',
          originalname: 'restaurant2.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake-image-2'),
          size: 2048,
        } as Express.Multer.File,
      ];

      const imageUrls = [
        'https://s3.ap-northeast-2.amazonaws.com/bucket/user-places/img1.jpg',
        'https://s3.ap-northeast-2.amazonaws.com/bucket/user-places/img2.jpg',
      ];

      const createdPlace = UserPlaceFactory.create({
        user,
        ...dto,
        photos: imageUrls,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      s3Client.uploadUserPlaceImage
        .mockResolvedValueOnce(imageUrls[0])
        .mockResolvedValueOnce(imageUrls[1]);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      const result = await service.create(userId, dto, mockFiles);

      // Assert
      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledTimes(2);
      expect(s3Client.uploadUserPlaceImage).toHaveBeenNthCalledWith(
        1,
        mockFiles[0],
      );
      expect(s3Client.uploadUserPlaceImage).toHaveBeenNthCalledWith(
        2,
        mockFiles[1],
      );
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          photos: imageUrls,
        }),
      );
      expect(result.photos).toEqual(imageUrls);
    });

    it('should create user place without images when files array is empty', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const createdPlace = UserPlaceFactory.create({
        user,
        ...dto,
        photos: null,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      const result = await service.create(userId, dto, []);

      // Assert
      expect(s3Client.uploadUserPlaceImage).not.toHaveBeenCalled();
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          photos: null,
        }),
      );
      expect(result.photos).toBeNull();
    });

    it('should limit images to maximum 5 when uploading', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const mockFiles: Express.Multer.File[] = Array(7)
        .fill(null)
        .map((_, i) => ({
          fieldname: 'images',
          originalname: `image${i + 1}.jpg`,
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from(`fake-image-${i + 1}`),
          size: 1024,
        })) as Express.Multer.File[];

      const imageUrls = Array(5)
        .fill(null)
        .map(
          (_, i) =>
            `https://s3.amazonaws.com/bucket/user-places/image${i + 1}.jpg`,
        );

      const createdPlace = UserPlaceFactory.create({
        user,
        ...dto,
        photos: imageUrls,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      s3Client.uploadUserPlaceImage.mockImplementation((file) =>
        Promise.resolve(
          `https://s3.amazonaws.com/bucket/user-places/${file.originalname}`,
        ),
      );
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      await service.create(userId, dto, mockFiles);

      // Assert
      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledTimes(5);
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          photos: expect.arrayContaining([
            expect.stringContaining('user-places/'),
          ]),
        }),
      );
    });

    it('should upload images in parallel for performance', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const mockFiles: Express.Multer.File[] = Array(3)
        .fill(null)
        .map((_, i) => ({
          fieldname: 'images',
          originalname: `image${i + 1}.jpg`,
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from(`fake-image-${i + 1}`),
          size: 1024,
        })) as Express.Multer.File[];

      const uploadDelay = 100;

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      s3Client.uploadUserPlaceImage.mockImplementation(
        (file) =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(`https://s3.amazonaws.com/bucket/${file.originalname}`);
            }, uploadDelay);
          }),
      );
      userPlaceRepository.create.mockReturnValue(
        UserPlaceFactory.create({ user }),
      );
      userPlaceRepository.save.mockResolvedValue(
        UserPlaceFactory.create({ user }),
      );

      // Act
      const uploadStartTime = Date.now();
      await service.create(userId, dto, mockFiles);
      const uploadDuration = Date.now() - uploadStartTime;

      // Assert
      // If uploads were sequential, it would take ~300ms (3 * 100ms)
      // If parallel, it should take ~100ms
      expect(uploadDuration).toBeLessThan(200); // Allow some overhead
      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledTimes(3);
    });

    it('should handle S3 upload errors gracefully', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'image.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake-image'),
          size: 1024,
        } as Express.Multer.File,
      ];

      const createdPlace = UserPlaceFactory.create({
        user,
        ...dto,
        photos: null, // No photos due to upload failure
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);
      s3Client.uploadUserPlaceImage.mockRejectedValue(
        new Error('S3 upload failed'),
      );

      // Mock logger to capture warnings
      const loggerWarnSpy = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation();

      // Act - Promise.allSettled allows partial failures, so this should not throw
      const result = await service.create(userId, dto, mockFiles);

      // Assert - Service continues despite S3 upload failure
      expect(result).toBeDefined();
      expect(result.photos).toBeNull(); // No photos due to upload failure
      expect(userPlaceRepository.save).toHaveBeenCalled();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('user place image upload(s) failed'),
      );

      loggerWarnSpy.mockRestore();
    });

    it('should handle different image file types', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'photo.png',
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: Buffer.from('fake-png'),
          size: 1024,
        } as Express.Multer.File,
        {
          fieldname: 'images',
          originalname: 'photo.webp',
          encoding: '7bit',
          mimetype: 'image/webp',
          buffer: Buffer.from('fake-webp'),
          size: 2048,
        } as Express.Multer.File,
      ];

      const imageUrls = [
        'https://s3.amazonaws.com/bucket/user-places/photo.png',
        'https://s3.amazonaws.com/bucket/user-places/photo.webp',
      ];

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      s3Client.uploadUserPlaceImage
        .mockResolvedValueOnce(imageUrls[0])
        .mockResolvedValueOnce(imageUrls[1]);
      userPlaceRepository.create.mockReturnValue(
        UserPlaceFactory.create({ user }),
      );
      userPlaceRepository.save.mockResolvedValue(
        UserPlaceFactory.create({ user }),
      );

      // Act
      await service.create(userId, dto, mockFiles);

      // Assert
      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledWith(mockFiles[0]);
      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledWith(mockFiles[1]);
    });

    it('should create place without images when files parameter is undefined', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const createdPlace = UserPlaceFactory.create({
        user,
        ...dto,
        photos: null,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);

      // Act
      const result = await service.create(userId, dto);

      // Assert
      expect(s3Client.uploadUserPlaceImage).not.toHaveBeenCalled();
      expect(result.photos).toBeNull();
    });

    it('should only store S3 URLs without file metadata', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'test.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake-data'),
          size: 1024,
          destination: '/tmp',
          filename: 'uploaded-file.jpg',
          path: '/tmp/uploaded-file.jpg',
        } as Express.Multer.File,
      ];

      const imageUrl = 'https://s3.amazonaws.com/bucket/user-places/test.jpg';

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      s3Client.uploadUserPlaceImage.mockResolvedValue(imageUrl);
      userPlaceRepository.create.mockReturnValue(
        UserPlaceFactory.create({ user }),
      );
      userPlaceRepository.save.mockResolvedValue(
        UserPlaceFactory.create({ user }),
      );

      // Act
      await service.create(userId, dto, mockFiles);

      // Assert
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          photos: [imageUrl],
        }),
      );
    });
  });

  describe('findAll', () => {
    const userId = 1;

    it('should return paginated user places', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const places = [
        UserPlaceFactory.create({ id: 1, user }),
        UserPlaceFactory.create({ id: 2, user }),
      ];
      const query: UserPlaceListQueryDto = { page: 1, limit: 10 };

      userPlaceRepository.findAndCount.mockResolvedValue([places, 2]);

      // Act
      const result = await service.findAll(userId, query);

      // Assert
      expect(result.items).toEqual(places);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(userPlaceRepository.findAndCount).toHaveBeenCalledWith({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter by status when provided', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const pendingPlaces = [UserPlaceFactory.createPending(user)];
      const query: UserPlaceListQueryDto = {
        page: 1,
        limit: 10,
        status: UserPlaceStatus.PENDING,
      };

      userPlaceRepository.findAndCount.mockResolvedValue([pendingPlaces, 1]);

      // Act
      await service.findAll(userId, query);

      // Assert
      expect(userPlaceRepository.findAndCount).toHaveBeenCalledWith({
        where: {
          user: { id: userId },
          status: UserPlaceStatus.PENDING,
        },
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter by search term when provided', async () => {
      // Arrange
      const query: UserPlaceListQueryDto = {
        page: 1,
        limit: 10,
        search: '맛있는',
      };

      userPlaceRepository.findAndCount.mockResolvedValue([[], 0]);

      // Act
      await service.findAll(userId, query);

      // Assert
      expect(userPlaceRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: { id: userId },
            name: expect.anything(), // Like operator
          }),
        }),
      );
    });

    it('should handle pagination correctly', async () => {
      // Arrange
      const query: UserPlaceListQueryDto = { page: 3, limit: 5 };

      userPlaceRepository.findAndCount.mockResolvedValue([[], 0]);

      // Act
      await service.findAll(userId, query);

      // Assert
      expect(userPlaceRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (3 - 1) * 5
          take: 5,
        }),
      );
    });

    it('should use default pagination when not provided', async () => {
      // Arrange
      const query: UserPlaceListQueryDto = {};

      userPlaceRepository.findAndCount.mockResolvedValue([[], 0]);

      // Act
      const result = await service.findAll(userId, query);

      // Assert
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(userPlaceRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should return empty array when no places exist', async () => {
      // Arrange
      const query: UserPlaceListQueryDto = { page: 1, limit: 10 };

      userPlaceRepository.findAndCount.mockResolvedValue([[], 0]);

      // Act
      const result = await service.findAll(userId, query);

      // Assert
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    const userId = 1;
    const placeId = 1;

    it('should return user place when found', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.create({ id: placeId, user });

      userPlaceRepository.findOne.mockResolvedValue(place);

      // Act
      const result = await service.findOne(userId, placeId);

      // Assert
      expect(result).toEqual(place);
      expect(userPlaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: placeId, user: { id: userId } },
      });
    });

    it('should throw NotFoundException when place not found', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(userId, 999999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(userId, 999999)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
          }),
        }),
      );
    });

    it('should throw NotFoundException when place belongs to different user', async () => {
      // Arrange
      const otherUser = UserFactory.create({ id: 999 });
      const place = UserPlaceFactory.create({ user: otherUser });

      userPlaceRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(userId, place.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    const userId = 1;
    const placeId = 1;

    it('should update PENDING status place successfully', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;

      const dto: UpdateUserPlaceDto = {
        name: '업데이트된 식당',
        address: '새 주소',
        version: 1,
      };

      const updatedPlace = { ...place, ...dto, version: 2 };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockResolvedValue(updatedPlace);

      // Act
      const result = await service.update(userId, placeId, dto);

      // Assert
      expect(result.name).toBe(dto.name);
      expect(result.address).toBe(dto.address);
      expect(userPlaceRepository.save).toHaveBeenCalled();
    });

    it('should update REJECTED status place and reset to PENDING', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createRejected(user);
      place.id = placeId;
      place.version = 1;

      const dto: UpdateUserPlaceDto = {
        name: '수정된 식당',
        version: 1,
      };

      const updatedPlace = {
        ...place,
        ...dto,
        status: UserPlaceStatus.PENDING,
        rejectionReason: null,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockResolvedValue(updatedPlace);

      // Act
      const result = await service.update(userId, placeId, dto);

      // Assert
      expect(result.status).toBe(UserPlaceStatus.PENDING);
      expect(result.rejectionReason).toBeNull();
    });

    it('should update lastSubmittedAt when REJECTED place is updated', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createRejected(user);
      place.id = placeId;
      place.version = 1;
      const oldSubmittedAt = new Date('2024-01-01');
      place.lastSubmittedAt = oldSubmittedAt;

      const dto: UpdateUserPlaceDto = {
        name: '수정된 식당',
        version: 1,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      // Act
      const result = await service.update(userId, placeId, dto);

      // Assert
      expect(result.lastSubmittedAt).not.toEqual(oldSubmittedAt);
      expect(result.lastSubmittedAt).toBeInstanceOf(Date);
    });

    it('should throw ForbiddenException when updating APPROVED status place', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createApproved(user);
      place.id = placeId;

      const dto: UpdateUserPlaceDto = {
        name: '업데이트 시도',
        version: 1,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);

      // Act & Assert
      await expect(service.update(userId, placeId, dto)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.update(userId, placeId, dto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_EDITABLE,
          }),
        }),
      );
    });

    it('should throw ConflictException when version mismatch occurs', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 2;

      const dto: UpdateUserPlaceDto = {
        name: '업데이트',
        version: 1, // Wrong version
      };

      userPlaceRepository.findOne.mockResolvedValue(place);

      // Act & Assert
      await expect(service.update(userId, placeId, dto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.update(userId, placeId, dto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_OPTIMISTIC_LOCK_FAILED,
          }),
        }),
      );
    });

    it('should update only provided fields', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.name = '원래 이름';
      place.address = '원래 주소';

      const dto: UpdateUserPlaceDto = {
        name: '새 이름',
        version: 1,
        // address not provided
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      // Act
      const result = await service.update(userId, placeId, dto);

      // Assert
      expect(result.name).toBe('새 이름');
      expect(result.address).toBe('원래 주소'); // Unchanged
    });

    it('should update all fields when all are provided', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.photos = ['https://example.com/photo.jpg'];

      const dto: UpdateUserPlaceDto = {
        name: '새 이름',
        address: '새 주소',
        latitude: 37.123,
        longitude: 127.456,
        menuTypes: ['중식', '짜장면', '짬뽕'],
        existingPhotos: ['https://example.com/photo.jpg'],
        openingHours: '매일 10:00-22:00',
        phoneNumber: '02-1111-2222',
        category: '중식',
        description: '중국집',
        version: 1,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      // Act
      const result = await service.update(userId, placeId, dto);

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

    it('should update location when coordinates are changed', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.latitude = 37.5;
      place.longitude = 127.0;

      const dto: UpdateUserPlaceDto = {
        latitude: 37.123,
        longitude: 127.456,
        version: 1,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      // Act
      const result = await service.update(userId, placeId, dto);

      // Assert
      expect(result.location).toEqual({
        type: 'Point',
        coordinates: [dto.longitude, dto.latitude],
      });
    });

    it('should update location when only latitude is changed', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.latitude = 37.5;
      place.longitude = 127.0;

      const dto: UpdateUserPlaceDto = {
        latitude: 37.123,
        version: 1,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      // Act
      const result = await service.update(userId, placeId, dto);

      // Assert
      expect(result.location).toEqual({
        type: 'Point',
        coordinates: [place.longitude, dto.latitude],
      });
    });

    it('should update location when only longitude is changed', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.latitude = 37.5;
      place.longitude = 127.0;

      const dto: UpdateUserPlaceDto = {
        longitude: 127.456,
        version: 1,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      // Act
      const result = await service.update(userId, placeId, dto);

      // Assert
      expect(result.location).toEqual({
        type: 'Point',
        coordinates: [dto.longitude, place.latitude],
      });
    });

    it('should not update lastSubmittedAt when PENDING place is updated', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      const originalSubmittedAt = new Date('2024-01-01');
      place.lastSubmittedAt = originalSubmittedAt;

      const dto: UpdateUserPlaceDto = {
        name: '수정된 이름',
        version: 1,
      };

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      // Act
      const result = await service.update(userId, placeId, dto);

      // Assert
      expect(result.lastSubmittedAt).toEqual(originalSubmittedAt);
    });
  });

  describe('remove', () => {
    const userId = 1;
    const placeId = 1;

    it('should delete PENDING status place successfully', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.softRemove.mockResolvedValue(place);

      // Act
      await service.remove(userId, placeId);

      // Assert
      expect(userPlaceRepository.softRemove).toHaveBeenCalledWith(place);
    });

    it('should delete REJECTED status place successfully', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createRejected(user);
      place.id = placeId;

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.softRemove.mockResolvedValue(place);

      // Act
      await service.remove(userId, placeId);

      // Assert
      expect(userPlaceRepository.softRemove).toHaveBeenCalledWith(place);
    });

    it('should throw ForbiddenException when deleting APPROVED status place', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createApproved(user);
      place.id = placeId;

      userPlaceRepository.findOne.mockResolvedValue(place);

      // Act & Assert
      await expect(service.remove(userId, placeId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.remove(userId, placeId)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_DELETABLE,
          }),
        }),
      );
    });

    it('should throw NotFoundException when place not found', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove(userId, 999999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Daily limit calculation (UTC based)', () => {
    const userId = 1;

    it('should count registrations created today in UTC timezone', async () => {
      // Arrange
      const now = new Date();
      const utcStart = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
      const utcEnd = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      userPlaceRepository.count.mockResolvedValue(3);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const dto: CheckRegistrationDto = {
        name: '테스트',
        address: '주소',
        latitude: 37.5,
        longitude: 127.0,
      };

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.dailyRemaining).toBe(2); // 5 - 3
      expect(userPlaceRepository.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: { id: userId },
            createdAt: expect.objectContaining({
              _type: 'between',
              _value: [utcStart, utcEnd],
            }),
          }),
        }),
      );
    });

    it('should reset daily count at UTC midnight', async () => {
      // Arrange
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);

      const user = UserFactory.create({ id: userId });
      const yesterdayPlace = UserPlaceFactory.create({
        user,
        createdAt: yesterday,
      });

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [yesterdayPlace],
        raw: [{ distance: '50' }],
      });

      // Mock: Yesterday's registration should not count for today
      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const dto: CheckRegistrationDto = {
        name: '테스트',
        address: '주소',
        latitude: 37.5,
        longitude: 127.0,
      };

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.dailyRemaining).toBe(USER_PLACE.DAILY_REGISTRATION_LIMIT);
    });
  });

  describe('New fields validation and behavior', () => {
    const userId = 1;

    describe('menuTypes field', () => {
      it('should include menuTypes when creating place', async () => {
        // Arrange
        const dto: CreateUserPlaceDto = {
          name: '테스트 식당',
          address: '주소',
          latitude: 37.5,
          longitude: 127.0,
          menuTypes: ['한식', '찌개류', '국밥'],
        };
        const user = UserFactory.create({ id: userId });
        const createdPlace = UserPlaceFactory.create({ user, ...dto });

        userPlaceRepository.count.mockResolvedValue(0);
        userPlaceRepository.findOne.mockResolvedValue(null);
        userPlaceRepository.create.mockReturnValue(createdPlace);
        userPlaceRepository.save.mockResolvedValue(createdPlace);

        // Act
        const result = await service.create(userId, dto);

        // Assert
        expect(result.menuTypes).toEqual(dto.menuTypes);
        expect(result.menuTypes.length).toBeGreaterThanOrEqual(1);
        expect(result.menuTypes.length).toBeLessThanOrEqual(10);
      });

      it('should update menuTypes field', async () => {
        // Arrange
        const placeId = 1;
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.createPending(user);
        place.id = placeId;
        place.version = 1;
        place.menuTypes = ['한식'];

        const dto: UpdateUserPlaceDto = {
          menuTypes: ['일식', '라멘', '돈카츠'],
          version: 1,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockImplementation((entity) =>
          Promise.resolve(entity as UserPlace),
        );

        // Act
        const result = await service.update(userId, placeId, dto);

        // Assert
        expect(result.menuTypes).toEqual(dto.menuTypes);
      });
    });

    describe('photos field', () => {
      it('should handle photos array when provided', async () => {
        // Arrange
        const dto: CreateUserPlaceDto = {
          name: '테스트 식당',
          address: '주소',
          latitude: 37.5,
          longitude: 127.0,
          menuTypes: ['한식'],
          photos: [
            'https://example.com/photo1.jpg',
            'https://example.com/photo2.jpg',
            'https://example.com/photo3.jpg',
          ],
        };
        const user = UserFactory.create({ id: userId });
        const createdPlace = UserPlaceFactory.create({ user, ...dto });

        userPlaceRepository.count.mockResolvedValue(0);
        userPlaceRepository.findOne.mockResolvedValue(null);
        userPlaceRepository.create.mockReturnValue(createdPlace);
        userPlaceRepository.save.mockResolvedValue(createdPlace);

        // Act
        const result = await service.create(userId, dto);

        // Assert
        expect(result.photos).toEqual(dto.photos);
        expect(result.photos!.length).toBeLessThanOrEqual(5);
      });

      it('should handle photos as null when not provided', async () => {
        // Arrange
        const dto: CreateUserPlaceDto = {
          name: '테스트 식당',
          address: '주소',
          latitude: 37.5,
          longitude: 127.0,
          menuTypes: ['한식'],
        };
        const user = UserFactory.create({ id: userId });
        const createdPlace = UserPlaceFactory.create({
          user,
          ...dto,
          photos: null,
        });

        userPlaceRepository.count.mockResolvedValue(0);
        userPlaceRepository.findOne.mockResolvedValue(null);
        userPlaceRepository.create.mockReturnValue(createdPlace);
        userPlaceRepository.save.mockResolvedValue(createdPlace);

        // Act
        const result = await service.create(userId, dto);

        // Assert
        expect(result.photos).toBeNull();
      });

      it('should update photos field', async () => {
        // Arrange
        const placeId = 1;
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.createPending(user);
        place.id = placeId;
        place.version = 1;
        place.photos = [
          'https://example.com/old-photo.jpg',
          'https://example.com/new-photo.jpg',
        ];

        const dto: UpdateUserPlaceDto = {
          existingPhotos: ['https://example.com/new-photo.jpg'],
          version: 1,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockImplementation((entity) =>
          Promise.resolve(entity as UserPlace),
        );

        // Act
        const result = await service.update(userId, placeId, dto);

        // Assert
        expect(result.photos).toEqual(dto.existingPhotos);
      });
    });

    describe('openingHours field', () => {
      it('should handle openingHours when provided', async () => {
        // Arrange
        const dto: CreateUserPlaceDto = {
          name: '테스트 식당',
          address: '주소',
          latitude: 37.5,
          longitude: 127.0,
          menuTypes: ['한식'],
          openingHours: '월-금: 11:00-22:00, 토-일: 12:00-21:00',
        };
        const user = UserFactory.create({ id: userId });
        const createdPlace = UserPlaceFactory.create({ user, ...dto });

        userPlaceRepository.count.mockResolvedValue(0);
        userPlaceRepository.findOne.mockResolvedValue(null);
        userPlaceRepository.create.mockReturnValue(createdPlace);
        userPlaceRepository.save.mockResolvedValue(createdPlace);

        // Act
        const result = await service.create(userId, dto);

        // Assert
        expect(result.openingHours).toBe(dto.openingHours);
        expect(result.openingHours!.length).toBeLessThanOrEqual(200);
      });

      it('should handle openingHours as null when not provided', async () => {
        // Arrange
        const dto: CreateUserPlaceDto = {
          name: '테스트 식당',
          address: '주소',
          latitude: 37.5,
          longitude: 127.0,
          menuTypes: ['한식'],
        };
        const user = UserFactory.create({ id: userId });
        const createdPlace = UserPlaceFactory.create({
          user,
          ...dto,
          openingHours: null,
        });

        userPlaceRepository.count.mockResolvedValue(0);
        userPlaceRepository.findOne.mockResolvedValue(null);
        userPlaceRepository.create.mockReturnValue(createdPlace);
        userPlaceRepository.save.mockResolvedValue(createdPlace);

        // Act
        const result = await service.create(userId, dto);

        // Assert
        expect(result.openingHours).toBeNull();
      });

      it('should update openingHours field', async () => {
        // Arrange
        const placeId = 1;
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.createPending(user);
        place.id = placeId;
        place.version = 1;
        place.openingHours = null;

        const dto: UpdateUserPlaceDto = {
          openingHours: '매일 09:00-20:00',
          version: 1,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockImplementation((entity) =>
          Promise.resolve(entity as UserPlace),
        );

        // Act
        const result = await service.update(userId, placeId, dto);

        // Assert
        expect(result.openingHours).toBe(dto.openingHours);
      });
    });

    describe('location field synchronization', () => {
      it('should create location point when creating place', async () => {
        // Arrange
        const dto: CreateUserPlaceDto = {
          name: '테스트 식당',
          address: '주소',
          latitude: 37.5012345,
          longitude: 127.0398765,
          menuTypes: ['한식'],
        };
        const user = UserFactory.create({ id: userId });
        const createdPlace = UserPlaceFactory.create({ user, ...dto });

        userPlaceRepository.count.mockResolvedValue(0);
        userPlaceRepository.findOne.mockResolvedValue(null);
        userPlaceRepository.create.mockReturnValue(createdPlace);
        userPlaceRepository.save.mockResolvedValue(createdPlace);

        // Act
        await service.create(userId, dto);

        // Assert
        expect(userPlaceRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            location: {
              type: 'Point',
              coordinates: [127.0398765, 37.5012345], // [lng, lat] order
            },
          }),
        );
      });

      it('should update location when latitude or longitude changes', async () => {
        // Arrange
        const placeId = 1;
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.createPending(user);
        place.id = placeId;
        place.version = 1;
        place.latitude = 37.5;
        place.longitude = 127.0;
        place.location = {
          type: 'Point',
          coordinates: [127.0, 37.5],
        } as any;

        const dto: UpdateUserPlaceDto = {
          latitude: 37.6,
          longitude: 127.1,
          version: 1,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockImplementation((entity) =>
          Promise.resolve(entity as UserPlace),
        );

        // Act
        const result = await service.update(userId, placeId, dto);

        // Assert
        expect(result.location).toEqual({
          type: 'Point',
          coordinates: [127.1, 37.6],
        });
      });

      it('should preserve location when coordinates are not changed', async () => {
        // Arrange
        const placeId = 1;
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.createPending(user);
        place.id = placeId;
        place.version = 1;
        place.latitude = 37.5;
        place.longitude = 127.0;
        const originalLocation = {
          type: 'Point' as const,
          coordinates: [127.0, 37.5],
        };
        place.location = originalLocation as any;

        const dto: UpdateUserPlaceDto = {
          name: '새 이름',
          version: 1,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockImplementation((entity) =>
          Promise.resolve(entity as UserPlace),
        );

        // Act
        const result = await service.update(userId, placeId, dto);

        // Assert
        expect(result.location).toEqual(originalLocation);
      });
    });

    describe('lastSubmittedAt field', () => {
      it('should set lastSubmittedAt when creating new place', async () => {
        // Arrange
        const dto: CreateUserPlaceDto = {
          name: '테스트 식당',
          address: '주소',
          latitude: 37.5,
          longitude: 127.0,
          menuTypes: ['한식'],
        };
        const user = UserFactory.create({ id: userId });
        const createdPlace = UserPlaceFactory.create({ user, ...dto });

        userPlaceRepository.count.mockResolvedValue(0);
        userPlaceRepository.findOne.mockResolvedValue(null);
        userPlaceRepository.create.mockReturnValue(createdPlace);
        userPlaceRepository.save.mockResolvedValue(createdPlace);

        const beforeCreate = new Date();

        // Act
        await service.create(userId, dto);

        // Assert
        expect(userPlaceRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lastSubmittedAt: expect.any(Date),
          }),
        );
        const callArgs = userPlaceRepository.create.mock.calls[0][0] as any;
        expect(callArgs.lastSubmittedAt.getTime()).toBeGreaterThanOrEqual(
          beforeCreate.getTime(),
        );
      });

      it('should update lastSubmittedAt when REJECTED place is updated', async () => {
        // Arrange
        const placeId = 1;
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.createRejected(user);
        place.id = placeId;
        place.version = 1;
        const oldSubmittedAt = new Date('2024-01-01T00:00:00Z');
        place.lastSubmittedAt = oldSubmittedAt;

        const dto: UpdateUserPlaceDto = {
          name: '수정된 식당',
          version: 1,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockImplementation((entity) =>
          Promise.resolve(entity as UserPlace),
        );

        const beforeUpdate = new Date();

        // Act
        const result = await service.update(userId, placeId, dto);

        // Assert
        expect(result.lastSubmittedAt).not.toEqual(oldSubmittedAt);
        expect(result.lastSubmittedAt!.getTime()).toBeGreaterThanOrEqual(
          beforeUpdate.getTime(),
        );
      });

      it('should not update lastSubmittedAt when PENDING place is updated', async () => {
        // Arrange
        const placeId = 1;
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.createPending(user);
        place.id = placeId;
        place.version = 1;
        const originalSubmittedAt = new Date('2024-01-01T00:00:00Z');
        place.lastSubmittedAt = originalSubmittedAt;

        const dto: UpdateUserPlaceDto = {
          name: '수정된 식당',
          version: 1,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockImplementation((entity) =>
          Promise.resolve(entity as UserPlace),
        );

        // Act
        const result = await service.update(userId, placeId, dto);

        // Assert
        expect(result.lastSubmittedAt).toEqual(originalSubmittedAt);
      });
    });

    describe('rejectionCount and lastRejectedAt fields', () => {
      it('should initialize rejectionCount to 0 when creating place', async () => {
        // Arrange
        const dto: CreateUserPlaceDto = {
          name: '테스트 식당',
          address: '주소',
          latitude: 37.5,
          longitude: 127.0,
          menuTypes: ['한식'],
        };
        const user = UserFactory.create({ id: userId });
        const createdPlace = UserPlaceFactory.create({
          user,
          ...dto,
          rejectionCount: 0,
          lastRejectedAt: null,
        });

        userPlaceRepository.count.mockResolvedValue(0);
        userPlaceRepository.findOne.mockResolvedValue(null);
        userPlaceRepository.create.mockReturnValue(createdPlace);
        userPlaceRepository.save.mockResolvedValue(createdPlace);

        // Act
        const result = await service.create(userId, dto);

        // Assert
        expect(result.rejectionCount).toBe(0);
        expect(result.lastRejectedAt).toBeNull();
      });

      it('should preserve rejectionCount when updating place', async () => {
        // Arrange
        const placeId = 1;
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.createRejected(user);
        place.id = placeId;
        place.version = 1;
        place.rejectionCount = 2;
        place.lastRejectedAt = new Date('2024-01-01');

        const dto: UpdateUserPlaceDto = {
          name: '수정된 식당',
          version: 1,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockImplementation((entity) =>
          Promise.resolve(entity as UserPlace),
        );

        // Act
        const result = await service.update(userId, placeId, dto);

        // Assert
        expect(result.rejectionCount).toBe(2);
        expect(result.lastRejectedAt).toEqual(place.lastRejectedAt);
      });
    });
  });

  describe('Nearby search with PostGIS', () => {
    const userId = 1;

    it('should use PostGIS ST_DWithin to filter places outside radius', async () => {
      // Arrange
      const mockQueryBuilder = createMockQueryBuilder();
      // PostGIS filters at database level - far places never returned
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      const dto: CheckRegistrationDto = {
        name: '강남역',
        address: '강남역',
        latitude: 37.498,
        longitude: 127.0276,
      };

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.nearbyPlaces).toEqual([]);
      expect(mockQueryBuilder.addSelect).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
      expect(mockQueryBuilder.setParameters).toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalled();
    });

    it('should use PostGIS ST_Distance to calculate accurate distances', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const nearbyPlace = UserPlaceFactory.create({
        user,
        latitude: 37.5012345,
        longitude: 127.0398765,
        name: '가까운 식당',
      });

      const mockQueryBuilder = createMockQueryBuilder();
      // PostGIS returns distance in meters calculated at database
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [nearbyPlace],
        raw: [{ distance: '45.678' }], // PostGIS ST_Distance result
      });

      const dto: CheckRegistrationDto = {
        name: '새 식당',
        address: '주소',
        latitude: 37.50124,
        longitude: 127.03988,
      };

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.nearbyPlaces.length).toBeGreaterThan(0);
      expect(result.nearbyPlaces[0].distance).toBeLessThan(
        USER_PLACE.NEARBY_SEARCH_RADIUS_METERS,
      );
      // Verify QueryBuilder chain was called
      expect(mockQueryBuilder.getRawAndEntities).toHaveBeenCalled();
    });

    it('should return places ordered by distance from PostGIS query', async () => {
      // Arrange
      const user = UserFactory.create({ id: userId });
      const place1 = UserPlaceFactory.create({
        user,
        id: 1,
        name: '가까운 곳',
      });
      const place2 = UserPlaceFactory.create({
        user,
        id: 2,
        name: '중간 거리',
      });
      const place3 = UserPlaceFactory.create({
        user,
        id: 3,
        name: '먼 곳',
      });

      const mockQueryBuilder = createMockQueryBuilder();
      // PostGIS ORDER BY distance ASC - already sorted
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [place1, place2, place3],
        raw: [{ distance: '10.5' }, { distance: '45.2' }, { distance: '89.7' }],
      });

      const dto: CheckRegistrationDto = {
        name: '테스트',
        address: '주소',
        latitude: 37.5,
        longitude: 127.0,
      };

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      // Act
      const result = await service.checkRegistration(userId, dto);

      // Assert
      expect(result.nearbyPlaces).toHaveLength(3);
      expect(result.nearbyPlaces[0].distance).toBe(11); // Rounded from 10.5
      expect(result.nearbyPlaces[1].distance).toBe(45); // Rounded from 45.2
      expect(result.nearbyPlaces[2].distance).toBe(90); // Rounded from 89.7
      expect(mockQueryBuilder.orderBy).toHaveBeenCalled();
    });
  });

  describe('approvePlace', () => {
    const placeId = 1;
    const adminId = 999;
    const ipAddress = '192.168.1.1';

    it('should approve PENDING place successfully', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;

      const approvedPlace = {
        ...pendingPlace,
        status: UserPlaceStatus.APPROVED,
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockResolvedValue(approvedPlace);
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      const result = await service.approvePlace(placeId, adminId, ipAddress);

      // Assert
      expect(result.status).toBe(UserPlaceStatus.APPROVED);
      expect(userPlaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: placeId, deletedAt: expect.anything() },
        relations: ['user'],
      });
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        UserPlace,
        expect.objectContaining({
          id: placeId,
          status: UserPlaceStatus.APPROVED,
        }),
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should create audit log when approving place', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;

      const approvedPlace = {
        ...pendingPlace,
        status: UserPlaceStatus.APPROVED,
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockResolvedValue(approvedPlace);
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      await service.approvePlace(placeId, adminId, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.objectContaining({
          adminId,
          action: AUDIT_ACTIONS.PLACE_APPROVED,
          target: `user-place:${placeId}`,
          previousValue: { status: UserPlaceStatus.PENDING },
          newValue: { status: UserPlaceStatus.APPROVED },
          ipAddress,
        }),
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.anything(),
      );
    });

    it('should throw NotFoundException when place does not exist', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.approvePlace(999999, adminId, ipAddress),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.approvePlace(999999, adminId, ipAddress),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
          }),
        }),
      );
    });

    it('should throw ConflictException when place is already APPROVED', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;
      approvedPlace.status = UserPlaceStatus.APPROVED;

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act & Assert
      await expect(
        service.approvePlace(placeId, adminId, ipAddress),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.approvePlace(placeId, adminId, ipAddress),
      ).rejects.toThrow(/Cannot approve place with status APPROVED/);
    });

    it('should throw ConflictException when place is REJECTED', async () => {
      // Arrange
      const rejectedPlace = UserPlaceFactory.createRejected();
      rejectedPlace.id = placeId;
      rejectedPlace.status = UserPlaceStatus.REJECTED;

      userPlaceRepository.findOne.mockResolvedValue(rejectedPlace);

      // Act & Assert
      await expect(
        service.approvePlace(placeId, adminId, ipAddress),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.approvePlace(placeId, adminId, ipAddress),
      ).rejects.toThrow(/Cannot approve place with status REJECTED/);
    });

    it('should record previousValue with PENDING status in audit log', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;

      const approvedPlace = {
        ...pendingPlace,
        status: UserPlaceStatus.APPROVED,
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockResolvedValue(approvedPlace);
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      await service.approvePlace(placeId, adminId, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.objectContaining({
          previousValue: { status: UserPlaceStatus.PENDING },
        }),
      );
    });

    it('should not allow approving soft-deleted place', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.approvePlace(placeId, adminId, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectPlace', () => {
    const placeId = 1;
    const adminId = 999;
    const ipAddress = '192.168.1.1';
    const dto: RejectUserPlaceDto = {
      reason:
        '주소 정보가 불명확하여 거절합니다. 정확한 도로명 주소를 입력해주세요.',
    };

    it('should reject PENDING place successfully', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;
      pendingPlace.rejectionCount = 0;

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...pendingPlace,
            status: UserPlaceStatus.REJECTED,
            rejectionReason: dto.reason,
            rejectionCount: 1,
            lastRejectedAt: expect.any(Date),
          }),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      const result = await service.rejectPlace(
        placeId,
        adminId,
        dto,
        ipAddress,
      );

      // Assert
      expect(result.status).toBe(UserPlaceStatus.REJECTED);
      expect(result.rejectionReason).toBe(dto.reason);
      expect(result.rejectionCount).toBe(1);
      expect(result.lastRejectedAt).toBeDefined();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should increment rejectionCount when rejecting place', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;
      pendingPlace.rejectionCount = 2; // Already rejected 2 times before

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...pendingPlace,
            status: UserPlaceStatus.REJECTED,
            rejectionReason: dto.reason,
            rejectionCount: 3,
            lastRejectedAt: expect.any(Date),
          }),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      const result = await service.rejectPlace(
        placeId,
        adminId,
        dto,
        ipAddress,
      );

      // Assert
      expect(result.rejectionCount).toBe(3);
    });

    it('should update rejectionReason with new reason', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;
      pendingPlace.rejectionReason = '이전 거절 사유';

      const newDto: RejectUserPlaceDto = {
        reason: '새로운 거절 사유입니다. 카테고리가 적절하지 않습니다.',
      };

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...pendingPlace,
            status: UserPlaceStatus.REJECTED,
            rejectionReason: newDto.reason,
            rejectionCount: 1,
            lastRejectedAt: expect.any(Date),
          }),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      const result = await service.rejectPlace(
        placeId,
        adminId,
        newDto,
        ipAddress,
      );

      // Assert
      expect(result.rejectionReason).toBe(newDto.reason);
    });

    it('should update lastRejectedAt timestamp', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;
      pendingPlace.lastRejectedAt = null;

      const beforeReject = new Date();

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockImplementation((entity, data) => {
            const saved = { ...data };
            if (!saved.lastRejectedAt) {
              saved.lastRejectedAt = new Date();
            }
            return Promise.resolve(saved);
          }),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      const result = await service.rejectPlace(
        placeId,
        adminId,
        dto,
        ipAddress,
      );

      // Assert
      expect(result.lastRejectedAt).toBeDefined();
      expect(result.lastRejectedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeReject.getTime(),
      );
    });

    it('should create rejection history entry', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...pendingPlace,
            status: UserPlaceStatus.REJECTED,
          }),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      await service.rejectPlace(placeId, adminId, dto, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        UserPlaceRejectionHistory,
        expect.objectContaining({
          userPlace: { id: placeId },
          admin: { id: adminId },
          reason: dto.reason,
        }),
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        UserPlaceRejectionHistory,
        expect.anything(),
      );
    });

    it('should create audit log entry', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;
      pendingPlace.rejectionCount = 0;

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...pendingPlace,
            status: UserPlaceStatus.REJECTED,
          }),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      await service.rejectPlace(placeId, adminId, dto, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.objectContaining({
          adminId,
          action: AUDIT_ACTIONS.PLACE_REJECTED,
          target: `user-place:${placeId}`,
          previousValue: {
            status: UserPlaceStatus.PENDING,
            rejectionCount: 0,
          },
          newValue: expect.objectContaining({
            status: UserPlaceStatus.REJECTED,
            rejectionReason: dto.reason,
          }),
          ipAddress,
        }),
      );
    });

    it('should throw NotFoundException when place does not exist', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.rejectPlace(999999, adminId, dto, ipAddress),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.rejectPlace(999999, adminId, dto, ipAddress),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
          }),
        }),
      );
    });

    it('should throw ConflictException when place is already APPROVED', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;
      approvedPlace.status = UserPlaceStatus.APPROVED;

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act & Assert
      await expect(
        service.rejectPlace(placeId, adminId, dto, ipAddress),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.rejectPlace(placeId, adminId, dto, ipAddress),
      ).rejects.toThrow(/Cannot reject place with status APPROVED/);
    });

    it('should throw ConflictException when place is already REJECTED', async () => {
      // Arrange
      const rejectedPlace = UserPlaceFactory.createRejected();
      rejectedPlace.id = placeId;
      rejectedPlace.status = UserPlaceStatus.REJECTED;

      userPlaceRepository.findOne.mockResolvedValue(rejectedPlace);

      // Act & Assert
      await expect(
        service.rejectPlace(placeId, adminId, dto, ipAddress),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.rejectPlace(placeId, adminId, dto, ipAddress),
      ).rejects.toThrow(/Cannot reject place with status REJECTED/);
    });

    it('should rollback transaction when error occurs', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockRejectedValue(new Error('Database error')),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act & Assert
      await expect(
        service.rejectPlace(placeId, adminId, dto, ipAddress),
      ).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should execute all operations in single transaction', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...pendingPlace,
            status: UserPlaceStatus.REJECTED,
          }),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      await service.rejectPlace(placeId, adminId, dto, ipAddress);

      // Assert
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(3); // UserPlace, RejectionHistory, AuditLog
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should record previous rejectionCount in audit log', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;
      pendingPlace.status = UserPlaceStatus.PENDING;
      pendingPlace.rejectionCount = 5;

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockResolvedValue({
            ...pendingPlace,
            status: UserPlaceStatus.REJECTED,
            rejectionCount: 6,
          }),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      // Act
      await service.rejectPlace(placeId, adminId, dto, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.objectContaining({
          previousValue: expect.objectContaining({
            rejectionCount: 5,
          }),
          newValue: expect.objectContaining({
            rejectionCount: 6,
          }),
        }),
      );
    });

    it('should not allow rejecting soft-deleted place', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.rejectPlace(placeId, adminId, dto, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePlaceByAdmin', () => {
    const placeId = 1;
    const adminId = 999;
    const ipAddress = '192.168.1.1';

    it('should update APPROVED place successfully with all fields', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;
      approvedPlace.name = '원래 이름';
      approvedPlace.address = '원래 주소';
      approvedPlace.latitude = 37.5012345;
      approvedPlace.longitude = 127.0398765;
      approvedPlace.menuTypes = ['한식'];
      approvedPlace.photos = ['https://s3.amazonaws.com/old-photo.jpg'];
      approvedPlace.openingHours = '10:00-22:00';
      approvedPlace.phoneNumber = '02-1234-5678';
      approvedPlace.category = '한식';
      approvedPlace.description = '원래 설명';

      const updateDto = {
        name: '업데이트된 이름',
        address: '업데이트된 주소',
        latitude: 37.6012345,
        longitude: 127.1398765,
        menuTypes: ['중식', '일식'],
        photos: [
          'https://s3.amazonaws.com/new-photo1.jpg',
          'https://s3.amazonaws.com/new-photo2.jpg',
        ],
        openingHours: '11:00-23:00',
        phoneNumber: '02-9999-8888',
        category: '중식',
        description: '업데이트된 설명',
      };

      const updatedPlace = {
        ...approvedPlace,
        ...updateDto,
        location: {
          type: 'Point',
          coordinates: [127.1398765, 37.6012345],
        },
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockResolvedValue(updatedPlace);
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act
      const result = await service.updatePlaceByAdmin(
        placeId,
        adminId,
        updateDto,
        ipAddress,
      );

      // Assert
      expect(result.name).toBe(updateDto.name);
      expect(result.address).toBe(updateDto.address);
      expect(result.latitude).toBe(updateDto.latitude);
      expect(result.longitude).toBe(updateDto.longitude);
      expect(result.menuTypes).toEqual(updateDto.menuTypes);
      expect(result.photos).toEqual(updateDto.photos);
      expect(result.openingHours).toBe(updateDto.openingHours);
      expect(result.phoneNumber).toBe(updateDto.phoneNumber);
      expect(result.category).toBe(updateDto.category);
      expect(result.description).toBe(updateDto.description);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should update place partially when only some fields are provided', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;
      approvedPlace.name = '원래 이름';
      approvedPlace.address = '원래 주소';
      approvedPlace.phoneNumber = '02-1234-5678';

      const updateDto = {
        name: '업데이트된 이름만',
      };

      const updatedPlace = {
        ...approvedPlace,
        name: updateDto.name,
        // Other fields remain unchanged
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockResolvedValue(updatedPlace);
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act
      const result = await service.updatePlaceByAdmin(
        placeId,
        adminId,
        updateDto,
        ipAddress,
      );

      // Assert
      expect(result.name).toBe(updateDto.name);
      expect(result.address).toBe(approvedPlace.address); // Unchanged
      expect(result.phoneNumber).toBe(approvedPlace.phoneNumber); // Unchanged
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException when place does not exist', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      const updateDto = {
        name: '업데이트된 이름',
      };

      // Act & Assert
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
          }),
        }),
      );
    });

    it('should throw BadRequestException when place is PENDING', async () => {
      // Arrange
      const pendingPlace = UserPlaceFactory.createPending();
      pendingPlace.id = placeId;

      userPlaceRepository.findOne.mockResolvedValue(pendingPlace);

      const updateDto = {
        name: '업데이트된 이름',
      };

      // Act & Assert
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow(
        'Cannot edit place with status PENDING. Only APPROVED places can be edited by admin.',
      );
    });

    it('should throw BadRequestException when place is REJECTED', async () => {
      // Arrange
      const rejectedPlace = UserPlaceFactory.createRejected();
      rejectedPlace.id = placeId;

      userPlaceRepository.findOne.mockResolvedValue(rejectedPlace);

      const updateDto = {
        name: '업데이트된 이름',
      };

      // Act & Assert
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow(
        'Cannot edit place with status REJECTED. Only APPROVED places can be edited by admin.',
      );
    });

    it('should create audit log with PLACE_UPDATED action', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;
      approvedPlace.name = '원래 이름';
      approvedPlace.address = '원래 주소';

      const updateDto = {
        name: '업데이트된 이름',
        address: '업데이트된 주소',
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockResolvedValue({
        ...approvedPlace,
        ...updateDto,
      });
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act
      await service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.objectContaining({
          adminId,
          action: AUDIT_ACTIONS.PLACE_UPDATED,
          target: `user-place:${placeId}`,
          previousValue: expect.objectContaining({
            name: '원래 이름',
            address: '원래 주소',
          }),
          newValue: expect.objectContaining({
            name: '업데이트된 이름',
            address: '업데이트된 주소',
          }),
          ipAddress,
        }),
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.any(Object),
      );
    });

    it('should update location point when latitude or longitude changes', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;
      approvedPlace.latitude = 37.5012345;
      approvedPlace.longitude = 127.0398765;

      const updateDto = {
        latitude: 37.6012345,
        longitude: 127.1398765,
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockImplementation((entity, data) => {
        return Promise.resolve(data);
      });
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act
      await service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        UserPlace,
        expect.objectContaining({
          latitude: updateDto.latitude,
          longitude: updateDto.longitude,
          location: {
            type: 'Point',
            coordinates: [updateDto.longitude, updateDto.latitude],
          },
        }),
      );
    });

    it('should update location point when only latitude changes', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;
      approvedPlace.latitude = 37.5012345;
      approvedPlace.longitude = 127.0398765;

      const updateDto = {
        latitude: 37.6012345,
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockImplementation((entity, data) => {
        return Promise.resolve(data);
      });
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act
      await service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        UserPlace,
        expect.objectContaining({
          latitude: updateDto.latitude,
          longitude: approvedPlace.longitude,
          location: {
            type: 'Point',
            coordinates: [approvedPlace.longitude, updateDto.latitude],
          },
        }),
      );
    });

    it('should track all changed fields in audit log', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;
      approvedPlace.name = '원래 이름';
      approvedPlace.menuTypes = ['한식'];
      approvedPlace.phoneNumber = '02-1234-5678';
      approvedPlace.category = '한식';

      const updateDto = {
        name: '업데이트된 이름',
        menuTypes: ['중식', '일식'],
        phoneNumber: '02-9999-8888',
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockResolvedValue({
        ...approvedPlace,
        ...updateDto,
      });
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act
      await service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress);

      // Assert
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        AdminAuditLog,
        expect.objectContaining({
          previousValue: expect.objectContaining({
            name: '원래 이름',
            menuTypes: ['한식'],
            phoneNumber: '02-1234-5678',
          }),
          newValue: expect.objectContaining({
            name: '업데이트된 이름',
            menuTypes: ['중식', '일식'],
            phoneNumber: '02-9999-8888',
          }),
        }),
      );
      // Unchanged fields should NOT be in audit log
      expect(mockQueryRunner.manager.create).not.toHaveBeenCalledWith(
        AdminAuditLog,
        expect.objectContaining({
          previousValue: expect.objectContaining({
            category: expect.anything(),
          }),
        }),
      );
    });

    it('should rollback transaction when save fails', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;

      const updateDto = {
        name: '업데이트된 이름',
      };

      const mockQueryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        manager: {
          save: jest.fn().mockRejectedValue(new Error('Database error')),
          create: jest.fn((entity, data) => data),
        },
      };

      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);
      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act & Assert
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow('Database error');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should execute all operations in single transaction', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;

      const updateDto = {
        name: '업데이트된 이름',
      };

      const mockQueryRunner = createMockQueryRunner();
      mockQueryRunner.manager.save.mockResolvedValue({
        ...approvedPlace,
        ...updateDto,
      });
      mockQueryRunner.manager.create.mockReturnValue({} as AdminAuditLog);
      mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner as any);

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act
      await service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress);

      // Assert
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(2); // UserPlace, AuditLog
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should not allow updating soft-deleted place', async () => {
      // Arrange
      userPlaceRepository.findOne.mockResolvedValue(null);

      const updateDto = {
        name: '업데이트된 이름',
      };

      // Act & Assert
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when no fields provided', async () => {
      // Arrange
      const approvedPlace = UserPlaceFactory.createApproved();
      approvedPlace.id = placeId;

      const updateDto = {};

      userPlaceRepository.findOne.mockResolvedValue(approvedPlace);

      // Act & Assert
      await expect(
        service.updatePlaceByAdmin(placeId, adminId, updateDto, ipAddress),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
