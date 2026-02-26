import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { USER_PLACE } from '@/common/constants/business.constants';
import { ErrorCode } from '@/common/constants/error-codes';
import { createMockRepository } from '../../../test/mocks/repository.mock';
import { createMockS3Client } from '../../../test/mocks/external-clients.mock';
import {
  UserFactory,
  UserPlaceFactory,
} from '../../../test/factories/entity.factory';
import { S3Client } from '@/external/aws/clients/s3.client';
import { UserPlace } from '../entities/user-place.entity';
import { UserPlaceStatus } from '../enum/user-place-status.enum';
import { UserPlaceService } from '../user-place.service';
import { CheckRegistrationDto } from '../dto/check-registration.dto';
import { CreateUserPlaceDto } from '../dto/create-user-place.dto';
import { UpdateUserPlaceDto } from '../dto/update-user-place.dto';
import { UserPlaceListQueryDto } from '../dto/user-place-list-query.dto';

describe('UserPlaceService', () => {
  let service: UserPlaceService;
  let userPlaceRepository: ReturnType<typeof createMockRepository<UserPlace>>;
  let s3Client: ReturnType<typeof createMockS3Client>;

  // Reusable mock QueryBuilder for PostGIS spatial queries
  const createMockQueryBuilder = () => ({
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
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    userPlaceRepository = createMockRepository<UserPlace>();
    s3Client = createMockS3Client();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserPlaceService,
        {
          provide: getRepositoryToken(UserPlace),
          useValue: userPlaceRepository,
        },
        {
          provide: S3Client,
          useValue: s3Client,
        },
      ],
    }).compile();

    service = module.get<UserPlaceService>(UserPlaceService);
  });

  // ---------------------------------------------------------------------------
  // checkRegistration
  // ---------------------------------------------------------------------------

  describe('checkRegistration', () => {
    const userId = 1;
    const dto: CheckRegistrationDto = {
      name: '새로운 식당',
      address: '서울특별시 강남구 테헤란로 456',
      latitude: 37.5012345,
      longitude: 127.0398765,
    };

    it('should return canRegister true when all conditions are met', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.checkRegistration(userId, dto);

      expect(result.canRegister).toBe(true);
      expect(result.dailyRemaining).toBe(USER_PLACE.DAILY_REGISTRATION_LIMIT);
      expect(result.duplicateExists).toBe(false);
      expect(result.nearbyPlaces).toEqual([]);
    });

    it('should return canRegister false when daily limit is reached', async () => {
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

      const result = await service.checkRegistration(userId, dto);

      expect(result.canRegister).toBe(false);
      expect(result.dailyRemaining).toBe(0);
    });

    it('should return canRegister false when duplicate exists', async () => {
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

      const result = await service.checkRegistration(userId, dto);

      expect(result.canRegister).toBe(false);
      expect(result.duplicateExists).toBe(true);
    });

    it('should return nearby places with rounded distance from PostGIS', async () => {
      const user = UserFactory.create({ id: userId });
      const place1 = UserPlaceFactory.create({ user, id: 1, name: '가까운 곳' });
      const place2 = UserPlaceFactory.create({ user, id: 2, name: '중간 거리' });
      const place3 = UserPlaceFactory.create({ user, id: 3, name: '먼 곳' });

      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [place1, place2, place3],
        raw: [
          { distance: '10.5' },
          { distance: '45.2' },
          { distance: '89.7' },
        ],
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.checkRegistration(userId, dto);

      expect(result.nearbyPlaces).toHaveLength(3);
      expect(result.nearbyPlaces[0].distance).toBe(11); // Math.round(10.5)
      expect(result.nearbyPlaces[1].distance).toBe(45); // Math.round(45.2)
      expect(result.nearbyPlaces[2].distance).toBe(90); // Math.round(89.7)
    });

    it('should invoke the PostGIS QueryBuilder chain with correct clauses', async () => {
      const mockQueryBuilder = createMockQueryBuilder();
      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.checkRegistration(userId, dto);

      expect(mockQueryBuilder.addSelect).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
      expect(mockQueryBuilder.setParameters).toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalled();
      expect(mockQueryBuilder.getRawAndEntities).toHaveBeenCalled();
    });

    it('should count today registrations with UTC date range', async () => {
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

      const result = await service.checkRegistration(userId, dto);

      expect(result.dailyRemaining).toBe(2); // USER_PLACE.DAILY_REGISTRATION_LIMIT(5) - 3
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
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

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

    it('should create user place successfully with all fields', async () => {
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

      const result = await service.create(userId, dto);

      expect(result).toEqual(createdPlace);
      expect(result.status).toBe(UserPlaceStatus.PENDING);
      expect(userPlaceRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { id: userId },
          name: dto.name,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          location: {
            type: 'Point',
            coordinates: [dto.longitude, dto.latitude],
          },
          menuTypes: dto.menuTypes,
          phoneNumber: dto.phoneNumber,
          category: dto.category,
          description: dto.description,
          status: UserPlaceStatus.PENDING,
          lastSubmittedAt: expect.any(Date),
        }),
      );
    });

    it('should create place with null optional fields when not provided', async () => {
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

      await service.create(userId, minimalDto);

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

    it('should throw BadRequestException when daily limit is exceeded', async () => {
      userPlaceRepository.count.mockResolvedValue(
        USER_PLACE.DAILY_REGISTRATION_LIMIT,
      );

      await expect(service.create(userId, dto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_DAILY_LIMIT_EXCEEDED,
          }),
        }),
      );
    });

    it('should throw BadRequestException when duplicate exists', async () => {
      const user = UserFactory.create({ id: userId });
      const duplicate = UserPlaceFactory.create({
        user,
        name: dto.name,
        address: dto.address,
      });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(duplicate);

      await expect(service.create(userId, dto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_DUPLICATE_REGISTRATION,
          }),
        }),
      );
    });

    it('should upload images to S3 and store URLs when files are provided', async () => {
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

      const result = await service.create(userId, dto, mockFiles);

      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledTimes(2);
      expect(result.photos).toEqual(imageUrls);
    });

    it('should limit uploaded images to maximum 5', async () => {
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

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      s3Client.uploadUserPlaceImage.mockImplementation((file) =>
        Promise.resolve(
          `https://s3.amazonaws.com/bucket/user-places/${file.originalname}`,
        ),
      );
      userPlaceRepository.create.mockReturnValue(UserPlaceFactory.create({}));
      userPlaceRepository.save.mockResolvedValue(UserPlaceFactory.create({}));

      await service.create(userId, dto, mockFiles);

      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledTimes(5);
    });

    it('should handle S3 upload errors gracefully and log warning', async () => {
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

      const createdPlace = UserPlaceFactory.create({ photos: null });

      userPlaceRepository.count.mockResolvedValue(0);
      userPlaceRepository.findOne.mockResolvedValue(null);
      userPlaceRepository.create.mockReturnValue(createdPlace);
      userPlaceRepository.save.mockResolvedValue(createdPlace);
      s3Client.uploadUserPlaceImage.mockRejectedValue(
        new Error('S3 upload failed'),
      );

      const loggerWarnSpy = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation();

      const result = await service.create(userId, dto, mockFiles);

      expect(result).toBeDefined();
      expect(result.photos).toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('user place image upload(s) failed'),
      );

      loggerWarnSpy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------

  describe('findAll', () => {
    const userId = 1;

    it('should return paginated user places', async () => {
      const user = UserFactory.create({ id: userId });
      const places = [
        UserPlaceFactory.create({ id: 1, user }),
        UserPlaceFactory.create({ id: 2, user }),
      ];
      const query: UserPlaceListQueryDto = { page: 1, limit: 10 };

      userPlaceRepository.findAndCount.mockResolvedValue([places, 2]);

      const result = await service.findAll(userId, query);

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
      const user = UserFactory.create({ id: userId });
      userPlaceRepository.findAndCount.mockResolvedValue([
        [UserPlaceFactory.createPending(user)],
        1,
      ]);

      await service.findAll(userId, {
        page: 1,
        limit: 10,
        status: UserPlaceStatus.PENDING,
      });

      expect(userPlaceRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: UserPlaceStatus.PENDING,
          }),
        }),
      );
    });

    it('should filter by search term when provided', async () => {
      userPlaceRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(userId, { page: 1, limit: 10, search: '맛있는' });

      expect(userPlaceRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: expect.anything(),
          }),
        }),
      );
    });

    it('should calculate correct skip for pagination', async () => {
      userPlaceRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll(userId, { page: 3, limit: 5 });

      expect(userPlaceRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('should use default page=1 and limit=10 when not provided', async () => {
      userPlaceRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll(userId, {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------

  describe('findOne', () => {
    const userId = 1;

    it('should return user place when found', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.create({ id: 1, user });

      userPlaceRepository.findOne.mockResolvedValue(place);

      const result = await service.findOne(userId, 1);

      expect(result).toEqual(place);
      expect(userPlaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, user: { id: userId } },
      });
    });

    it('should throw NotFoundException when place not found', async () => {
      userPlaceRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(userId, 999)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_FOUND,
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  describe('update', () => {
    const userId = 1;
    const placeId = 1;

    // Status-based editability consolidated into test.each
    test.each([
      ['PENDING', UserPlaceStatus.PENDING],
      ['REJECTED', UserPlaceStatus.REJECTED],
    ] as Array<[string, UserPlaceStatus]>)(
      'should update %s place successfully',
      async (_label, status) => {
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.create({
          user,
          id: placeId,
          status,
          version: 1,
          rejectionReason:
            status === UserPlaceStatus.REJECTED ? '주소 불명확' : null,
        });

        const dto: UpdateUserPlaceDto = { name: '업데이트된 식당', version: 1 };
        const updatedPlace = {
          ...place,
          name: dto.name,
          status: UserPlaceStatus.PENDING,
          rejectionReason: null,
        };

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.save.mockResolvedValue(updatedPlace as UserPlace);

        const result = await service.update(userId, placeId, dto);

        expect(result.name).toBe(dto.name);
        expect(result.status).toBe(UserPlaceStatus.PENDING);
        if (status === UserPlaceStatus.REJECTED) {
          expect(result.rejectionReason).toBeNull();
        }
      },
    );

    it('should throw ForbiddenException when updating APPROVED place', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createApproved(user);
      place.id = placeId;

      userPlaceRepository.findOne.mockResolvedValue(place);

      await expect(
        service.update(userId, placeId, { name: '시도', version: 1 }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_EDITABLE,
          }),
        }),
      );
    });

    it('should throw ConflictException when version mismatch occurs', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 2;

      userPlaceRepository.findOne.mockResolvedValue(place);

      await expect(
        service.update(userId, placeId, { version: 1 }), // stale version
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_OPTIMISTIC_LOCK_FAILED,
          }),
        }),
      );
    });

    it('should update only provided fields, leaving others unchanged', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.name = '원래 이름';
      place.address = '원래 주소';

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        name: '새 이름',
        version: 1,
      });

      expect(result.name).toBe('새 이름');
      expect(result.address).toBe('원래 주소');
    });

    it('should update location GeoJSON point when coordinates change', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.latitude = 37.5;
      place.longitude = 127.0;

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        latitude: 37.123,
        longitude: 127.456,
        version: 1,
      });

      expect(result.location).toEqual({
        type: 'Point',
        coordinates: [127.456, 37.123],
      });
    });

    it('should not update lastSubmittedAt when PENDING place is updated', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      const originalSubmittedAt = new Date('2024-01-01');
      place.lastSubmittedAt = originalSubmittedAt;

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        name: '수정',
        version: 1,
      });

      expect(result.lastSubmittedAt).toEqual(originalSubmittedAt);
    });

    it('should update lastSubmittedAt when REJECTED place is updated', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createRejected(user);
      place.id = placeId;
      place.version = 1;
      place.lastSubmittedAt = new Date('2024-01-01');

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        name: '수정',
        version: 1,
      });

      expect(result.lastSubmittedAt).not.toEqual(new Date('2024-01-01'));
    });

    it('should remove a photo by excluding it from existingPhotos', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.photos = [
        'https://example.com/old-photo.jpg',
        'https://example.com/new-photo.jpg',
      ];

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        existingPhotos: ['https://example.com/new-photo.jpg'],
        version: 1,
      });

      expect(result.photos).toEqual(['https://example.com/new-photo.jpg']);
    });

    it('should preserve existing photos when existingPhotos is undefined and no new files', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.photos = [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ];

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        name: '업데이트 이름',
        version: 1,
        // existingPhotos is not provided (undefined) and no files
      });

      expect(result.photos).toEqual([
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
      ]);
    });

    it('should set photos to null when existingPhotos is empty array and no new files', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.photos = ['https://example.com/photo.jpg'];

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        existingPhotos: [],
        version: 1,
      });

      expect(result.photos).toBeNull();
    });

    it('should upload new photos during update and merge with existing', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.photos = ['https://example.com/existing-photo.jpg'];

      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'new-photo.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('new-photo'),
          size: 1024,
        } as Express.Multer.File,
      ];

      const newPhotoUrl =
        'https://s3.amazonaws.com/user-places/new-photo-uuid.jpg';

      userPlaceRepository.findOne.mockResolvedValue(place);
      s3Client.uploadUserPlaceImage.mockResolvedValue(newPhotoUrl);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        existingPhotos: ['https://example.com/existing-photo.jpg'],
        version: 1,
      }, mockFiles);

      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledTimes(1);
      expect(result.photos).toContain('https://example.com/existing-photo.jpg');
      expect(result.photos).toContain(newPhotoUrl);
    });

    it('should log warning and continue when S3 upload fails during update', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.photos = null;

      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'images',
          originalname: 'photo.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from('photo'),
          size: 1024,
        } as Express.Multer.File,
      ];

      userPlaceRepository.findOne.mockResolvedValue(place);
      s3Client.uploadUserPlaceImage.mockRejectedValue(
        new Error('S3 upload failed'),
      );
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const loggerWarnSpy = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation();

      const result = await service.update(userId, placeId, {
        existingPhotos: [],
        version: 1,
      }, mockFiles);

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('user place image upload(s) failed during update'),
      );
      expect(result).toBeDefined();

      loggerWarnSpy.mockRestore();
    });

    it('should enforce max 5 photos when both existing and new files are provided', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.photos = [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
        'https://example.com/photo3.jpg',
        'https://example.com/photo4.jpg',
      ];

      const mockFiles: Express.Multer.File[] = Array(3)
        .fill(null)
        .map((_, i) => ({
          fieldname: 'images',
          originalname: `new-photo-${i + 1}.jpg`,
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from(`photo-${i}`),
          size: 1024,
        })) as Express.Multer.File[];

      userPlaceRepository.findOne.mockResolvedValue(place);
      s3Client.uploadUserPlaceImage.mockImplementation((file) =>
        Promise.resolve(
          `https://s3.amazonaws.com/user-places/${file.originalname}`,
        ),
      );
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        existingPhotos: [
          'https://example.com/photo1.jpg',
          'https://example.com/photo2.jpg',
          'https://example.com/photo3.jpg',
          'https://example.com/photo4.jpg',
        ],
        version: 1,
      }, mockFiles);

      // Existing 4 + up to 1 new = max 5
      expect(s3Client.uploadUserPlaceImage).toHaveBeenCalledTimes(1);
      expect(result.photos).toHaveLength(5);
    });

    it('should throw ConflictException when OptimisticLockVersionMismatchError is thrown by save', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;

      userPlaceRepository.findOne.mockResolvedValue(place);

      const optimisticError = new OptimisticLockVersionMismatchError(
        'UserPlace',
        1,
        2,
      );
      userPlaceRepository.save.mockRejectedValue(optimisticError);

      await expect(
        service.update(userId, placeId, { version: 1 }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_OPTIMISTIC_LOCK_FAILED,
          }),
        }),
      );
    });

    it('should re-throw non-optimistic-lock errors from save', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;

      userPlaceRepository.findOne.mockResolvedValue(place);

      const genericError = new Error('Database connection lost');
      userPlaceRepository.save.mockRejectedValue(genericError);

      await expect(
        service.update(userId, placeId, { version: 1 }),
      ).rejects.toThrow('Database connection lost');
    });

    it('should filter out URLs not in current place.photos when existingPhotos contains foreign URLs', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createPending(user);
      place.id = placeId;
      place.version = 1;
      place.photos = ['https://example.com/legitimate.jpg'];

      userPlaceRepository.findOne.mockResolvedValue(place);
      userPlaceRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity as UserPlace),
      );

      const result = await service.update(userId, placeId, {
        existingPhotos: [
          'https://example.com/legitimate.jpg',
          'https://attacker.com/malicious.jpg', // not in current place.photos
        ],
        version: 1,
      });

      expect(result.photos).toEqual(['https://example.com/legitimate.jpg']);
      expect(result.photos).not.toContain('https://attacker.com/malicious.jpg');
    });
  });

  // ---------------------------------------------------------------------------
  // remove
  // ---------------------------------------------------------------------------

  describe('remove', () => {
    const userId = 1;
    const placeId = 1;

    // Status-based deletability consolidated into test.each
    test.each([
      ['PENDING', UserPlaceStatus.PENDING],
      ['REJECTED', UserPlaceStatus.REJECTED],
    ] as Array<[string, UserPlaceStatus]>)(
      'should soft-delete %s place successfully',
      async (_label, status) => {
        const user = UserFactory.create({ id: userId });
        const place = UserPlaceFactory.create({
          user,
          id: placeId,
          status,
        });

        userPlaceRepository.findOne.mockResolvedValue(place);
        userPlaceRepository.softRemove.mockResolvedValue(place);

        await service.remove(userId, placeId);

        expect(userPlaceRepository.softRemove).toHaveBeenCalledWith(place);
      },
    );

    it('should throw ForbiddenException when deleting APPROVED place', async () => {
      const user = UserFactory.create({ id: userId });
      const place = UserPlaceFactory.createApproved(user);
      place.id = placeId;

      userPlaceRepository.findOne.mockResolvedValue(place);

      await expect(service.remove(userId, placeId)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            errorCode: ErrorCode.USER_PLACE_NOT_DELETABLE,
          }),
        }),
      );
    });

    it('should throw NotFoundException when place not found', async () => {
      userPlaceRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(userId, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
