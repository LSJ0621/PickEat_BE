import { Test, TestingModule } from '@nestjs/testing';
import { UserPlaceController } from '../user-place.controller';
import { UserPlaceService } from '../user-place.service';
import { UserService } from '@/user/user.service';
import { createMockService } from '../../../test/utils/test-helpers';
import { UserFactory } from '../../../test/factories/entity.factory';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import { CreateUserPlaceDto } from '../dto/create-user-place.dto';
import { UpdateUserPlaceDto } from '../dto/update-user-place.dto';
import { UserPlaceListQueryDto } from '../dto/user-place-list-query.dto';
import { CheckRegistrationDto } from '../dto/check-registration.dto';
import { UserPlaceStatus } from '../enum/user-place-status.enum';
import { MessageCode } from '@/common/constants/message-codes';

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
    status: UserPlaceStatus.PENDING,
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

describe('UserPlaceController', () => {
  let controller: UserPlaceController;
  let userPlaceService: jest.Mocked<UserPlaceService>;
  let userService: jest.Mocked<UserService>;

  const authUser: AuthUserPayload = {
    email: 'test@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    userPlaceService = createMockService<UserPlaceService>([
      'checkRegistration',
      'create',
      'findAll',
      'findOne',
      'update',
      'remove',
    ]);
    userService = createMockService<UserService>(['getAuthenticatedEntity']);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserPlaceController],
      providers: [
        {
          provide: UserPlaceService,
          useValue: userPlaceService,
        },
        {
          provide: UserService,
          useValue: userService,
        },
      ],
    }).compile();

    controller = module.get<UserPlaceController>(UserPlaceController);
  });

  it('should create controller instance when service dependencies are injected', () => {
    expect(controller).toBeDefined();
  });

  describe('checkRegistration', () => {
    const dto: CheckRegistrationDto = {
      name: '새로운 식당',
      address: '서울특별시 강남구 테헤란로 456',
      latitude: 37.5012345,
      longitude: 127.0398765,
    };

    it('should check if user can register a new place', async () => {
      const user = UserFactory.create();
      const checkResult = {
        canRegister: true,
        dailyRemaining: 5,
        duplicateExists: false,
        nearbyPlaces: [],
      };

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.checkRegistration.mockResolvedValue(checkResult);

      const result = await controller.checkRegistration(dto, authUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(userPlaceService.checkRegistration).toHaveBeenCalledWith(
        user.id,
        dto,
      );
      expect(result).toEqual(checkResult);
    });
  });

  describe('create', () => {
    const dto: CreateUserPlaceDto = {
      name: '새로운 식당',
      address: '서울특별시 강남구 테헤란로 456',
      latitude: 37.5012345,
      longitude: 127.0398765,
      menuTypes: ['한식', '찌개류'],
      phoneNumber: '02-9999-8888',
      category: '한식',
      description: '맛있는 한식집',
    };

    it('should create a user place when no files are provided', async () => {
      const user = UserFactory.create();
      const userPlace = createMockUserPlace({ id: 1, photos: null });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.create.mockResolvedValue(userPlace);

      const result = await controller.create(dto, [], authUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(userPlaceService.create).toHaveBeenCalledWith(user.id, dto, []);
      expect(result).toMatchObject({
        ...userPlace,
        messageCode: MessageCode.USER_PLACE_CREATED,
      });
    });

    it('should create a user place when files are provided', async () => {
      const user = UserFactory.create();
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

      const userPlace = createMockUserPlace({
        id: 2,
        photos: [
          'https://s3.amazonaws.com/bucket/user-places/restaurant1.jpg',
          'https://s3.amazonaws.com/bucket/user-places/restaurant2.jpg',
        ],
      });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.create.mockResolvedValue(userPlace);

      const result = await controller.create(dto, mockFiles, authUser);

      expect(userPlaceService.create).toHaveBeenCalledWith(
        user.id,
        dto,
        mockFiles,
      );
      expect(result.photos).toEqual(userPlace.photos);
      expect(result.messageCode).toBe(MessageCode.USER_PLACE_CREATED);
    });

    it('should handle user place creation when files parameter is undefined', async () => {
      const user = UserFactory.create();
      const userPlace = createMockUserPlace({ id: 3, photos: null });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.create.mockResolvedValue(userPlace);

      const result = await controller.create(
        dto,
        undefined as unknown as Express.Multer.File[],
        authUser,
      );

      expect(userPlaceService.create).toHaveBeenCalledWith(user.id, dto, []);
      expect(result.photos).toBeNull();
    });

    it('should accept up to 5 files when multiple files are uploaded', async () => {
      const user = UserFactory.create();
      const mockFiles: Express.Multer.File[] = Array(5)
        .fill(null)
        .map((_, i) => ({
          fieldname: 'images',
          originalname: `image${i + 1}.jpg`,
          encoding: '7bit',
          mimetype: 'image/jpeg',
          buffer: Buffer.from(`fake-image-${i + 1}`),
          size: 1024,
        })) as Express.Multer.File[];

      const userPlace = createMockUserPlace({
        id: 4,
        photos: mockFiles.map(
          (f) =>
            `https://s3.amazonaws.com/bucket/user-places/${f.originalname}`,
        ),
      });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.create.mockResolvedValue(userPlace);

      const result = await controller.create(dto, mockFiles, authUser);

      expect(userPlaceService.create).toHaveBeenCalledWith(
        user.id,
        dto,
        mockFiles,
      );
      expect(result.photos).toHaveLength(5);
    });

    it('should include messageCode in response when place is created', async () => {
      const user = UserFactory.create();
      const userPlace = createMockUserPlace();

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.create.mockResolvedValue(userPlace);

      const result = await controller.create(dto, [], authUser);

      expect(result).toHaveProperty('messageCode');
      expect(result.messageCode).toBe(MessageCode.USER_PLACE_CREATED);
    });

    it('should handle different image file types', async () => {
      const user = UserFactory.create();
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

      const userPlace = createMockUserPlace({
        photos: [
          'https://s3.amazonaws.com/bucket/user-places/photo.png',
          'https://s3.amazonaws.com/bucket/user-places/photo.webp',
        ],
      });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.create.mockResolvedValue(userPlace);

      const result = await controller.create(dto, mockFiles, authUser);

      expect(userPlaceService.create).toHaveBeenCalledWith(
        user.id,
        dto,
        mockFiles,
      );
      expect(result.photos).toEqual(userPlace.photos);
    });

    it('should pass empty array when files is undefined', async () => {
      const user = UserFactory.create();
      const userPlace = createMockUserPlace({ photos: null });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.create.mockResolvedValue(userPlace);

      await controller.create(
        dto,
        undefined as unknown as Express.Multer.File[],
        authUser,
      );

      expect(userPlaceService.create).toHaveBeenCalledWith(
        user.id,
        dto,
        [], // Should convert undefined to empty array
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated user places', async () => {
      const user = UserFactory.create();
      const query: UserPlaceListQueryDto = { page: 1, limit: 10 };
      const response = {
        items: [createMockUserPlace({ id: 1 }), createMockUserPlace({ id: 2 })],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      };

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.findAll.mockResolvedValue(response);

      const result = await controller.findAll(query, authUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(userPlaceService.findAll).toHaveBeenCalledWith(user.id, query);
      expect(result).toEqual(response);
    });
  });

  describe('findOne', () => {
    it('should return a single user place', async () => {
      const user = UserFactory.create();
      const userPlace = createMockUserPlace({ id: 1 });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.findOne.mockResolvedValue(userPlace);

      const result = await controller.findOne(1, authUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(userPlaceService.findOne).toHaveBeenCalledWith(user.id, 1);
      expect(result).toEqual(userPlace);
    });
  });

  describe('update', () => {
    it('should update a user place successfully', async () => {
      const user = UserFactory.create();
      const dto: UpdateUserPlaceDto = {
        name: '업데이트된 식당',
        version: 1,
      };
      const updatedPlace = createMockUserPlace({
        id: 1,
        name: '업데이트된 식당',
      });

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.update.mockResolvedValue(updatedPlace);

      const result = await controller.update(1, dto, [], authUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(userPlaceService.update).toHaveBeenCalledWith(user.id, 1, dto, []);
      expect(result).toMatchObject({
        ...updatedPlace,
        messageCode: MessageCode.USER_PLACE_UPDATED,
      });
    });
  });

  describe('remove', () => {
    it('should delete a user place successfully', async () => {
      const user = UserFactory.create();

      userService.getAuthenticatedEntity.mockResolvedValue(user);
      userPlaceService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(1, authUser);

      expect(userService.getAuthenticatedEntity).toHaveBeenCalledWith(
        authUser.email,
      );
      expect(userPlaceService.remove).toHaveBeenCalledWith(user.id, 1);
      expect(result).toEqual({
        messageCode: MessageCode.USER_PLACE_DELETED,
      });
    });
  });
});
