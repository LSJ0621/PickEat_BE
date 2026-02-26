import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserService } from '../user.service';
import { User } from '../entities/user.entity';
import { AddressSearchService } from '../services/address-search.service';
import { UserAddressService } from '../services/user-address.service';
import { UserPreferenceService } from '../services/user-preference.service';
import { RedisCacheService } from '@/common/cache/cache.service';
import {
  UserFactory,
  UserPreferencesFactory,
  UserAddressFactory,
} from '../../../test/factories/entity.factory';
import { createMockService } from '../../../test/utils/test-helpers';
import { SocialType } from '../enum/social-type.enum';

describe('UserService', () => {
  let service: UserService;
  let userRepository: jest.Mocked<Repository<User>>;
  let dataSource: jest.Mocked<DataSource>;
  let addressSearchService: jest.Mocked<AddressSearchService>;
  let userAddressService: jest.Mocked<UserAddressService>;
  let userPreferenceService: jest.Mocked<UserPreferenceService>;
  let cacheService: jest.Mocked<RedisCacheService>;

  beforeEach(async () => {
    userRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      findByIds: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      softRemove: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;

    dataSource = {
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    addressSearchService = createMockService<AddressSearchService>([
      'searchAddress',
    ]);

    userAddressService = createMockService<UserAddressService>([
      'updateSingleAddress',
      'getAddresses',
      'createAddress',
      'updateAddress',
      'deleteAddresses',
      'setDefaultAddress',
      'setSearchAddress',
      'getDefaultAddress',
    ]);

    userPreferenceService = createMockService<UserPreferenceService>([
      'getPreferences',
      'updatePreferences',
      'updatePreferencesAnalysis',
    ]);

    cacheService = createMockService<RedisCacheService>([
      'invalidateUserProfile',
      'invalidateUserAddresses',
      'invalidateUserPreferences',
    ]);
    cacheService.invalidateUserProfile.mockResolvedValue(undefined);
    cacheService.invalidateUserAddresses.mockResolvedValue(undefined);
    cacheService.invalidateUserPreferences.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: AddressSearchService,
          useValue: addressSearchService,
        },
        {
          provide: UserAddressService,
          useValue: userAddressService,
        },
        {
          provide: UserPreferenceService,
          useValue: userPreferenceService,
        },
        {
          provide: RedisCacheService,
          useValue: cacheService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user with required fields and default language', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword123',
        role: 'USER',
      };
      const createdUser = UserFactory.create(userData);
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      const result = await service.createUser(userData);

      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        email: userData.email,
        password: userData.password,
        role: userData.role,
        name: undefined,
        preferredLanguage: 'ko',
      });
      expect(userRepository.save).toHaveBeenCalledWith(createdUser);
    });

    it('should set name to undefined when null is passed', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword123',
        role: 'USER',
        name: null,
      };
      const createdUser = UserFactory.create({ ...userData, name: null });
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      await service.createUser(userData);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: undefined }),
      );
    });

    it('should use specified preferredLanguage when provided', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword123',
        preferredLanguage: 'en' as const,
      };
      const createdUser = UserFactory.create(userData);
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      await service.createUser(userData);

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ preferredLanguage: 'en' }),
      );
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      const email = 'test@example.com';
      const user = UserFactory.create({ email });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.findByEmail(email);

      expect(result).toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
    });

    it('should return null when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('updatePassword', () => {
    it('should update user password and set lastPasswordChangedAt', async () => {
      const user = UserFactory.create({
        email: 'test@example.com',
        lastPasswordChangedAt: null,
      });
      const newHashedPassword = 'newHashedPassword123';
      const before = new Date();
      userRepository.save.mockResolvedValue(user);

      const result = await service.updatePassword(user, newHashedPassword);
      const after = new Date();

      expect(result.password).toBe(newHashedPassword);
      expect(user.lastPasswordChangedAt).toBeInstanceOf(Date);
      expect(user.lastPasswordChangedAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(user.lastPasswordChangedAt!.getTime()).toBeLessThanOrEqual(
        after.getTime(),
      );
      expect(userRepository.save).toHaveBeenCalledWith(user);
    });

    it('should throw BadRequestException on optimistic lock conflict', async () => {
      const user = UserFactory.create({ email: 'test@example.com' });
      const { OptimisticLockVersionMismatchError } = await import('typeorm');
      userRepository.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('User', 1, 2),
      );

      await expect(
        service.updatePassword(user, 'newPassword'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('markEmailVerified', () => {
    it('should mark email as verified when user exists and not yet verified', async () => {
      const email = 'test@example.com';
      const user = UserFactory.create({ email, emailVerified: false });
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, emailVerified: true });

      await service.markEmailVerified(email);

      expect(user.emailVerified).toBe(true);
      expect(userRepository.save).toHaveBeenCalledWith(user);
    });

    it('should return early if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await service.markEmailVerified('nonexistent@example.com');

      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should return early if email already verified', async () => {
      const email = 'test@example.com';
      const user = UserFactory.create({ email, emailVerified: true });
      userRepository.findOne.mockResolvedValue(user);

      await service.markEmailVerified(email);

      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getOrFailByEmail', () => {
    it('should return user when found', async () => {
      const email = 'test@example.com';
      const user = UserFactory.create({ email });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.getOrFailByEmail(email);

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getOrFailByEmail('nonexistent@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAuthenticatedEntity', () => {
    it('should return user for authenticated email', async () => {
      const email = 'test@example.com';
      const user = UserFactory.create({ email });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.getAuthenticatedEntity(email);

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getAuthenticatedEntity('nonexistent@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserBySocialId', () => {
    it('should find user by social id including soft deleted records', async () => {
      const socialId = 'kakao_123456';
      const user = UserFactory.createWithSocial(
        'social@example.com',
        socialId,
        'kakao',
      );
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.getUserBySocialId(socialId);

      expect(result).toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { socialId },
        withDeleted: true,
      });
    });

    it('should convert numeric social id to string', async () => {
      const socialId = 123456;
      const user = UserFactory.createWithSocial(
        'social@example.com',
        '123456',
        'google',
      );
      userRepository.findOne.mockResolvedValue(user);

      await service.getUserBySocialId(socialId);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { socialId: '123456' },
        withDeleted: true,
      });
    });

    it('should return null when social user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.getUserBySocialId('nonexistent_123');

      expect(result).toBeNull();
    });
  });

  describe('createOauth', () => {
    it('should create OAuth user with all parameters', async () => {
      const socialId = 'kakao_123456';
      const email = 'social@example.com';
      const socialType = SocialType.KAKAO;
      const name = 'Social User';
      const createdUser = UserFactory.createWithSocial(email, socialId, socialType);
      createdUser.name = name;
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      const result = await service.createOauth(socialId, email, socialType, name);

      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        email,
        socialId,
        socialType,
        role: 'USER',
        name,
        password: null,
        preferredLanguage: 'ko',
      });
    });

    it('should set password to null and convert numeric id to string for OAuth users', async () => {
      const socialId = 999888777;
      const email = 'social@example.com';
      const socialType = SocialType.GOOGLE;
      const createdUser = UserFactory.createWithSocial(email, '999888777', socialType);
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      const result = await service.createOauth(socialId, email, socialType);

      expect(result.password).toBeNull();
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ socialId: '999888777', password: null }),
      );
    });
  });

  describe('findOne', () => {
    it('should return user when found by id', async () => {
      const userId = 1;
      const user = UserFactory.create({ id: userId });
      userRepository.findOneBy.mockResolvedValue(user);

      const result = await service.findOne(userId);

      expect(result).toEqual(user);
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: userId });
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteUser', () => {
    const buildMockManager = (user: User | null) => ({
      findOne: jest.fn().mockResolvedValue(user),
      save: jest.fn().mockResolvedValue(user),
      softRemove: jest.fn().mockResolvedValue(user),
    });

    const setupTransaction = (mockManager: ReturnType<typeof buildMockManager>) => {
      dataSource.transaction.mockImplementation(
        async (
          _isolationOrRunInTransaction: unknown,
          runInTransaction?: unknown,
        ) => {
          const callback = runInTransaction ?? _isolationOrRunInTransaction;
          return (
            callback as (manager: typeof mockManager) => Promise<unknown>
          )(mockManager);
        },
      );
    };

    it('should soft delete user and clear tokens', async () => {
      const email = 'test@example.com';
      const user = UserFactory.create({
        email,
        refreshToken: 'valid-refresh-token',
        reRegisterEmailVerified: true,
      });
      const mockManager = buildMockManager(user);
      setupTransaction(mockManager);

      await service.deleteUser(email);

      expect(user.refreshToken).toBeNull();
      expect(user.reRegisterEmailVerified).toBe(false);
      expect(mockManager.save).toHaveBeenCalledWith(user);
      expect(mockManager.softRemove).toHaveBeenCalledWith(user);
    });

    it('should throw NotFoundException when user not found', async () => {
      const mockManager = buildMockManager(null);
      setupTransaction(mockManager);

      await expect(service.deleteUser('nonexistent@example.com')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when user already deleted', async () => {
      const user = UserFactory.create({
        email: 'test@example.com',
        deletedAt: new Date(),
      });
      const mockManager = buildMockManager(user);
      setupTransaction(mockManager);

      await expect(service.deleteUser('test@example.com')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getEntityPreferences', () => {
    it('should delegate to userPreferenceService', async () => {
      const user = UserFactory.create();
      const preferences = UserPreferencesFactory.create();
      userPreferenceService.getPreferences.mockResolvedValue(preferences);

      const result = await service.getEntityPreferences(user);

      expect(result).toEqual(preferences);
      expect(userPreferenceService.getPreferences).toHaveBeenCalledWith(user);
    });
  });

  describe('getEntityPreferencesByUserIds', () => {
    it('should return preferences map for each user', async () => {
      const user1 = UserFactory.create({ id: 1 });
      const user2 = UserFactory.create({ id: 2 });
      const prefs1 = UserPreferencesFactory.create();
      const prefs2 = UserPreferencesFactory.create();
      userRepository.findByIds = jest.fn().mockResolvedValue([user1, user2]);
      userPreferenceService.getPreferences
        .mockResolvedValueOnce(prefs1)
        .mockResolvedValueOnce(prefs2);

      const result = await service.getEntityPreferencesByUserIds([1, 2]);

      expect(result.get(1)).toEqual(prefs1);
      expect(result.get(2)).toEqual(prefs2);
    });

    it('should return empty map when userIds is empty', async () => {
      const result = await service.getEntityPreferencesByUserIds([]);

      expect(result.size).toBe(0);
      expect(userRepository.findByIds).not.toHaveBeenCalled();
    });
  });

  describe('updateEntityPreferences', () => {
    it('should delegate to userPreferenceService with likes and dislikes', async () => {
      const user = UserFactory.create();
      const likes = ['한식', '중식'];
      const dislikes = ['양식'];
      const updatedPreferences = UserPreferencesFactory.create({ likes, dislikes });
      userPreferenceService.updatePreferences.mockResolvedValue(updatedPreferences);

      const result = await service.updateEntityPreferences(user, likes, dislikes);

      expect(result).toEqual(updatedPreferences);
      expect(userPreferenceService.updatePreferences).toHaveBeenCalledWith(
        user,
        likes,
        dislikes,
      );
    });

    it('should pass undefined for omitted parameters', async () => {
      const user = UserFactory.create();
      const likes = ['한식'];
      const updatedPreferences = UserPreferencesFactory.create({ likes, dislikes: [] });
      userPreferenceService.updatePreferences.mockResolvedValue(updatedPreferences);

      await service.updateEntityPreferences(user, likes, undefined);

      expect(userPreferenceService.updatePreferences).toHaveBeenCalledWith(
        user,
        likes,
        undefined,
      );
    });
  });

  describe('updateEntityPreferencesAnalysis', () => {
    it('should delegate to userPreferenceService', async () => {
      const user = UserFactory.create();
      const analysis = '한식을 선호하고 매운 음식을 좋아하시네요.';
      const updatedPreferences = UserPreferencesFactory.create();
      updatedPreferences.analysis = analysis;
      userPreferenceService.updatePreferencesAnalysis.mockResolvedValue(
        updatedPreferences,
      );

      const result = await service.updateEntityPreferencesAnalysis(user, analysis);

      expect(result).toEqual(updatedPreferences);
      expect(
        userPreferenceService.updatePreferencesAnalysis,
      ).toHaveBeenCalledWith(user, analysis);
    });
  });

  describe('updateEntityLanguage', () => {
    const mockExecute = jest.fn();
    const mockReturning = jest.fn().mockReturnValue({ execute: mockExecute });
    const mockWhere = jest.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = jest.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
    const mockCreateQueryBuilder = jest
      .fn()
      .mockReturnValue({ update: mockUpdate });

    beforeEach(() => {
      userRepository.createQueryBuilder =
        mockCreateQueryBuilder as unknown as typeof userRepository.createQueryBuilder;
    });

    it('should update language and invalidate cache', async () => {
      const email = 'test@example.com';
      const userId = 42;
      mockExecute.mockResolvedValue({ affected: 1, raw: [{ id: userId }] });

      await service.updateEntityLanguage(email, 'en');

      expect(mockSet).toHaveBeenCalledWith({ preferredLanguage: 'en' });
      expect(mockWhere).toHaveBeenCalledWith('email = :email', { email });
      expect(cacheService.invalidateUserProfile).toHaveBeenCalledWith(userId);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockExecute.mockResolvedValue({ affected: 0, raw: [] });

      await expect(
        service.updateEntityLanguage('nonexistent@example.com', 'ko'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should resolve successfully even if cache invalidation fails', async () => {
      mockExecute.mockResolvedValue({ affected: 1, raw: [{ id: 1 }] });
      cacheService.invalidateUserProfile.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(
        service.updateEntityLanguage('test@example.com', 'en'),
      ).resolves.not.toThrow();
    });
  });

  // ========== Address delegation methods ==========
  // These methods are thin wrappers that forward calls to sub-services.
  // Each test verifies correct forwarding of arguments and return values.

  const mockRawAddress = {
    address: '서울특별시 강남구 테헤란로 123',
    roadAddress: '서울특별시 강남구 테헤란로 123',
    postalCode: '06234',
    latitude: '37.5012345',
    longitude: '127.0398765',
  };

  describe('searchAddress', () => {
    it('should delegate to addressSearchService', async () => {
      const searchDto = { query: '강남구 테헤란로' };
      const searchResponse = {
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        addresses: [mockRawAddress],
      };
      addressSearchService.searchAddress.mockResolvedValue(searchResponse);

      const result = await service.searchAddress(searchDto);

      expect(result).toEqual(searchResponse);
      expect(addressSearchService.searchAddress).toHaveBeenCalledWith(searchDto);
    });
  });

  describe('updateEntitySingleAddress', () => {
    it('should delegate to userAddressService', async () => {
      const user = UserFactory.create();
      const updatedAddress = UserAddressFactory.create({ user });
      userAddressService.updateSingleAddress.mockResolvedValue(updatedAddress);

      const result = await service.updateEntitySingleAddress(user, mockRawAddress);

      expect(result).toEqual(updatedAddress);
      expect(userAddressService.updateSingleAddress).toHaveBeenCalledWith(
        user,
        mockRawAddress,
      );
    });
  });

  describe('getEntityAddresses', () => {
    it('should delegate to userAddressService', async () => {
      const user = UserFactory.create();
      const addresses = [UserAddressFactory.create({ user })];
      userAddressService.getAddresses.mockResolvedValue(addresses);

      const result = await service.getEntityAddresses(user);

      expect(result).toEqual(addresses);
      expect(userAddressService.getAddresses).toHaveBeenCalledWith(user);
    });
  });

  describe('createEntityAddress', () => {
    it('should delegate to userAddressService', async () => {
      const user = UserFactory.create();
      const dto = { selectedAddress: mockRawAddress, alias: '회사' };
      const createdAddress = UserAddressFactory.create({ user, alias: '회사' });
      userAddressService.createAddress.mockResolvedValue(createdAddress);

      const result = await service.createEntityAddress(user, dto);

      expect(result).toEqual(createdAddress);
      expect(userAddressService.createAddress).toHaveBeenCalledWith(user, dto);
    });
  });

  describe('updateEntityAddress', () => {
    it('should delegate to userAddressService', async () => {
      const user = UserFactory.create();
      const addressId = 1;
      const dto = { alias: '새로운 별칭', isDefault: true };
      const updatedAddress = UserAddressFactory.create({ id: addressId, user });
      userAddressService.updateAddress.mockResolvedValue(updatedAddress);

      const result = await service.updateEntityAddress(user, addressId, dto);

      expect(result).toEqual(updatedAddress);
      expect(userAddressService.updateAddress).toHaveBeenCalledWith(user, addressId, dto);
    });
  });

  describe('deleteEntityAddresses', () => {
    it('should delegate to userAddressService', async () => {
      const user = UserFactory.create();
      const addressIds = [1, 2, 3];
      userAddressService.deleteAddresses.mockResolvedValue(undefined);

      await service.deleteEntityAddresses(user, addressIds);

      expect(userAddressService.deleteAddresses).toHaveBeenCalledWith(user, addressIds);
    });
  });

  describe('setEntityDefaultAddress', () => {
    it('should delegate to userAddressService', async () => {
      const user = UserFactory.create();
      const addressId = 1;
      const defaultAddress = UserAddressFactory.create({ id: addressId, user, isDefault: true });
      userAddressService.setDefaultAddress.mockResolvedValue(defaultAddress);

      const result = await service.setEntityDefaultAddress(user, addressId);

      expect(result).toEqual(defaultAddress);
      expect(userAddressService.setDefaultAddress).toHaveBeenCalledWith(user, addressId);
    });
  });

  describe('setEntitySearchAddress', () => {
    it('should delegate to userAddressService', async () => {
      const user = UserFactory.create();
      const addressId = 1;
      const searchAddress = UserAddressFactory.create({ id: addressId, user, isSearchAddress: true });
      userAddressService.setSearchAddress.mockResolvedValue(searchAddress);

      const result = await service.setEntitySearchAddress(user, addressId);

      expect(result).toEqual(searchAddress);
      expect(userAddressService.setSearchAddress).toHaveBeenCalledWith(user, addressId);
    });
  });

  describe('getEntityDefaultAddress', () => {
    it('should return default address when it exists', async () => {
      const user = UserFactory.create();
      const defaultAddress = UserAddressFactory.createDefault(user);
      userAddressService.getDefaultAddress.mockResolvedValue(defaultAddress);

      const result = await service.getEntityDefaultAddress(user);

      expect(result).toEqual(defaultAddress);
      expect(userAddressService.getDefaultAddress).toHaveBeenCalledWith(user);
    });

    it('should return null when no default address exists', async () => {
      const user = UserFactory.create();
      userAddressService.getDefaultAddress.mockResolvedValue(null);

      const result = await service.getEntityDefaultAddress(user);

      expect(result).toBeNull();
    });
  });

  describe('updateEntityName', () => {
    it('should update user name and save', async () => {
      const user = UserFactory.create({ name: 'Old Name' });
      const newName = 'New Name';
      const updatedUser = { ...user, name: newName };
      userRepository.save.mockResolvedValue(updatedUser);

      const result = await service.updateEntityName(user, newName);

      expect(user.name).toBe(newName);
      expect(result.name).toBe(newName);
      expect(userRepository.save).toHaveBeenCalledWith(user);
    });

    it('should throw BadRequestException on optimistic lock conflict', async () => {
      const user = UserFactory.create({ name: 'Old Name' });
      const { OptimisticLockVersionMismatchError } = await import('typeorm');
      userRepository.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('User', 1, 2),
      );

      await expect(service.updateEntityName(user, 'New Name')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update all provided fields and save', async () => {
      const userId = 1;
      const user = UserFactory.create({
        id: userId,
        name: 'Old Name',
        birthDate: null,
        gender: null,
      });
      const updates = {
        name: 'New Name',
        birthDate: '1995-03-20',
        gender: 'female' as const,
      };
      userRepository.findOneBy.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({
        ...user,
        name: 'New Name',
        birthDate: '1995-03-20',
        gender: 'female',
      });

      const result = await service.updateProfile(userId, updates);

      expect(result.name).toBe('New Name');
      expect(result.birthDate).toBe('1995-03-20');
      expect(result.gender).toBe('female');
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: userId });
      expect(userRepository.save).toHaveBeenCalledWith(user);
    });

    it('should only update fields that are explicitly provided', async () => {
      const userId = 1;
      const user = UserFactory.create({
        id: userId,
        name: 'Original Name',
        birthDate: '1990-06-15',
        gender: 'male',
      });
      const updates = { birthDate: '1995-03-20' };
      userRepository.findOneBy.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({
        ...user,
        birthDate: '1995-03-20',
      });

      const result = await service.updateProfile(userId, updates);

      expect(result.name).toBe('Original Name');
      expect(result.birthDate).toBe('1995-03-20');
      expect(result.gender).toBe('male');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepository.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateProfile(999, { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on optimistic lock conflict', async () => {
      const userId = 1;
      const user = UserFactory.create({ id: userId });
      const { OptimisticLockVersionMismatchError } = await import('typeorm');
      userRepository.findOneBy.mockResolvedValue(user);
      userRepository.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('User', 1, 2),
      );

      await expect(
        service.updateProfile(userId, { name: 'New Name' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
