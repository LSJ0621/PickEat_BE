import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserService } from '../user.service';
import { User } from '../entities/user.entity';
import { AddressSearchService } from '../services/address-search.service';
import { UserAddressService } from '../services/user-address.service';
import { UserPreferenceService } from '../services/user-preference.service';
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

  beforeEach(async () => {
    userRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
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
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user with email and password', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword123',
        role: 'USER',
      };
      const createdUser = UserFactory.create(userData);
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      // Act
      const result = await service.createUser(userData);

      // Assert
      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        email: userData.email,
        password: userData.password,
        role: userData.role,
        name: undefined,
      });
      expect(userRepository.save).toHaveBeenCalledWith(createdUser);
    });

    it('should create a user with name', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword123',
        role: 'USER',
        name: 'Test User',
      };
      const createdUser = UserFactory.create(userData);
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      // Act
      const result = await service.createUser(userData);

      // Assert
      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        email: userData.email,
        password: userData.password,
        role: userData.role,
        name: userData.name,
      });
    });

    it('should create a user with null name', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword123',
        role: 'USER',
        name: null,
      };
      const createdUser = UserFactory.create({ ...userData, name: null });
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      // Act
      const result = await service.createUser(userData);

      // Assert
      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        email: userData.email,
        password: userData.password,
        role: userData.role,
        name: undefined,
      });
    });

    it('should create a user without specifying role', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        password: 'hashedPassword123',
      };
      const createdUser = UserFactory.create(userData);
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      // Act
      const result = await service.createUser(userData);

      // Assert
      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        email: userData.email,
        password: userData.password,
        role: undefined,
        name: undefined,
      });
    });
  });

  describe('findByEmail', () => {
    it('should return user when found by email', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = UserFactory.create({ email });
      userRepository.findOne.mockResolvedValue(user);

      // Act
      const result = await service.findByEmail(email);

      // Assert
      expect(result).toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
    });

    it('should return null when user not found', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      userRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.findByEmail(email);

      // Assert
      expect(result).toBeNull();
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
    });
  });

  describe('updatePassword', () => {
    it('should update user password and lastPasswordChangedAt', async () => {
      // Arrange
      const user = UserFactory.create({ email: 'test@example.com' });
      const newHashedPassword = 'newHashedPassword123';
      userRepository.save.mockResolvedValue(user);

      // Act
      const result = await service.updatePassword(user, newHashedPassword);

      // Assert
      expect(result.password).toBe(newHashedPassword);
      expect(result.lastPasswordChangedAt).toBeInstanceOf(Date);
      expect(userRepository.save).toHaveBeenCalledWith(user);
    });

    it('should set lastPasswordChangedAt to current date', async () => {
      // Arrange
      const user = UserFactory.create({
        email: 'test@example.com',
        lastPasswordChangedAt: null,
      });
      const newHashedPassword = 'newHashedPassword123';
      const beforeUpdate = new Date();
      userRepository.save.mockResolvedValue(user);

      // Act
      await service.updatePassword(user, newHashedPassword);
      const afterUpdate = new Date();

      // Assert
      expect(user.lastPasswordChangedAt).toBeDefined();
      expect(user.lastPasswordChangedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeUpdate.getTime(),
      );
      expect(user.lastPasswordChangedAt!.getTime()).toBeLessThanOrEqual(
        afterUpdate.getTime(),
      );
    });
  });

  describe('markEmailVerified', () => {
    it('should mark email as verified when user exists', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = UserFactory.create({ email, emailVerified: false });
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, emailVerified: true });

      // Act
      await service.markEmailVerified(email);

      // Assert
      expect(user.emailVerified).toBe(true);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(userRepository.save).toHaveBeenCalledWith(user);
    });

    it('should return early if user not found', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      userRepository.findOne.mockResolvedValue(null);

      // Act
      await service.markEmailVerified(email);

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should return early if email already verified', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = UserFactory.create({ email, emailVerified: true });
      userRepository.findOne.mockResolvedValue(user);

      // Act
      await service.markEmailVerified(email);

      // Assert
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getOrFailByEmail', () => {
    it('should return user when found', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = UserFactory.create({ email });
      userRepository.findOne.mockResolvedValue(user);

      // Act
      const result = await service.getOrFailByEmail(email);

      // Assert
      expect(result).toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getOrFailByEmail(email)).rejects.toThrow(
        new NotFoundException(`User with email ${email} not found`),
      );
    });
  });

  describe('getAuthenticatedEntity', () => {
    it('should return user for authenticated email', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = UserFactory.create({ email });
      userRepository.findOne.mockResolvedValue(user);

      // Act
      const result = await service.getAuthenticatedEntity(email);

      // Assert
      expect(result).toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      userRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getAuthenticatedEntity(email)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserBySocialId', () => {
    it('should find user by string social id', async () => {
      // Arrange
      const socialId = 'kakao_123456';
      const user = UserFactory.createWithSocial(
        'social@example.com',
        socialId,
        'kakao',
      );
      userRepository.findOne.mockResolvedValue(user);

      // Act
      const result = await service.getUserBySocialId(socialId);

      // Assert
      expect(result).toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { socialId: socialId },
        withDeleted: true,
      });
    });

    it('should find user by numeric social id', async () => {
      // Arrange
      const socialId = 123456;
      const user = UserFactory.createWithSocial(
        'social@example.com',
        '123456',
        'google',
      );
      userRepository.findOne.mockResolvedValue(user);

      // Act
      const result = await service.getUserBySocialId(socialId);

      // Assert
      expect(result).toEqual(user);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { socialId: '123456' },
        withDeleted: true,
      });
    });

    it('should return null when social user not found', async () => {
      // Arrange
      const socialId = 'nonexistent_123';
      userRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getUserBySocialId(socialId);

      // Assert
      expect(result).toBeNull();
    });

    it('should include soft deleted users in search', async () => {
      // Arrange
      const socialId = 'kakao_123456';
      const deletedUser = UserFactory.createWithSocial(
        'social@example.com',
        socialId,
        'kakao',
      );
      deletedUser.deletedAt = new Date();
      userRepository.findOne.mockResolvedValue(deletedUser);

      // Act
      const result = await service.getUserBySocialId(socialId);

      // Assert
      expect(result).toEqual(deletedUser);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { socialId: socialId },
        withDeleted: true,
      });
    });
  });

  describe('createOauth', () => {
    it('should create OAuth user with all parameters', async () => {
      // Arrange
      const socialId = 'kakao_123456';
      const email = 'social@example.com';
      const socialType = SocialType.KAKAO;
      const name = 'Social User';
      const createdUser = UserFactory.createWithSocial(
        email,
        socialId,
        socialType,
      );
      createdUser.name = name;
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      // Act
      const result = await service.createOauth(
        socialId,
        email,
        socialType,
        name,
      );

      // Assert
      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        email,
        socialId: socialId,
        socialType,
        role: 'USER',
        name,
        password: null,
      });
    });

    it('should create OAuth user without name', async () => {
      // Arrange
      const socialId = 123456;
      const email = 'social@example.com';
      const socialType = SocialType.GOOGLE;
      const createdUser = UserFactory.createWithSocial(
        email,
        '123456',
        socialType,
      );
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      // Act
      const result = await service.createOauth(socialId, email, socialType);

      // Assert
      expect(result).toEqual(createdUser);
      expect(userRepository.create).toHaveBeenCalledWith({
        email,
        socialId: '123456',
        socialType,
        role: 'USER',
        name: undefined,
        password: null,
      });
    });

    it('should convert numeric social id to string', async () => {
      // Arrange
      const socialId = 999888777;
      const email = 'social@example.com';
      const socialType = SocialType.GOOGLE;
      const createdUser = UserFactory.createWithSocial(
        email,
        '999888777',
        socialType,
      );
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      // Act
      await service.createOauth(socialId, email, socialType);

      // Assert
      expect(userRepository.create).toHaveBeenCalledWith({
        email,
        socialId: '999888777',
        socialType,
        role: 'USER',
        name: undefined,
        password: null,
      });
    });

    it('should set password to null for OAuth users', async () => {
      // Arrange
      const socialId = 'kakao_123';
      const email = 'social@example.com';
      const socialType = SocialType.KAKAO;
      const createdUser = UserFactory.createWithSocial(
        email,
        socialId,
        socialType,
      );
      userRepository.create.mockReturnValue(createdUser);
      userRepository.save.mockResolvedValue(createdUser);

      // Act
      const result = await service.createOauth(socialId, email, socialType);

      // Assert
      expect(result.password).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return user when found by id', async () => {
      // Arrange
      const userId = 1;
      const user = UserFactory.create({ id: userId });
      userRepository.findOneBy.mockResolvedValue(user);

      // Act
      const result = await service.findOne(userId);

      // Assert
      expect(result).toEqual(user);
      expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: userId });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      const userId = 999;
      userRepository.findOneBy.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(userId)).rejects.toThrow(
        new NotFoundException(`User ${userId} not found`),
      );
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user successfully', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = UserFactory.create({ email, refreshToken: 'some-token' });
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue(user),
        softRemove: jest.fn().mockResolvedValue(user),
      };
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

      // Act
      await service.deleteUser(email);

      // Assert
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(mockManager.findOne).toHaveBeenCalledWith(User, {
        where: { email },
        withDeleted: true,
      });
      expect(user.refreshToken).toBeNull();
      expect(user.reRegisterEmailVerified).toBe(false);
      expect(mockManager.save).toHaveBeenCalledWith(user);
      expect(mockManager.softRemove).toHaveBeenCalledWith(user);
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };
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

      // Act & Assert
      await expect(service.deleteUser(email)).rejects.toThrow(
        new NotFoundException('사용자를 찾을 수 없습니다.'),
      );
      expect(mockManager.findOne).toHaveBeenCalledWith(User, {
        where: { email },
        withDeleted: true,
      });
    });

    it('should throw BadRequestException when user already deleted', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = UserFactory.create({ email, deletedAt: new Date() });
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(user),
      };
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

      // Act & Assert
      await expect(service.deleteUser(email)).rejects.toThrow(
        new BadRequestException('이미 탈퇴한 계정입니다.'),
      );
    });

    it('should clear refreshToken and reRegisterEmailVerified before soft delete', async () => {
      // Arrange
      const email = 'test@example.com';
      const user = UserFactory.create({
        email,
        refreshToken: 'valid-refresh-token',
        reRegisterEmailVerified: true,
      });
      const mockManager = {
        findOne: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockResolvedValue(user),
        softRemove: jest.fn().mockResolvedValue(user),
      };
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

      // Act
      await service.deleteUser(email);

      // Assert
      expect(user.refreshToken).toBeNull();
      expect(user.reRegisterEmailVerified).toBe(false);
      expect(mockManager.save).toHaveBeenCalledWith(user);
    });
  });

  describe('getEntityPreferences', () => {
    it('should delegate to userPreferenceService', async () => {
      // Arrange
      const user = UserFactory.create();
      const preferences = UserPreferencesFactory.create();
      userPreferenceService.getPreferences.mockResolvedValue(preferences);

      // Act
      const result = await service.getEntityPreferences(user);

      // Assert
      expect(result).toEqual(preferences);
      expect(userPreferenceService.getPreferences).toHaveBeenCalledWith(user);
    });
  });

  describe('updateEntityPreferences', () => {
    it('should update both likes and dislikes', async () => {
      // Arrange
      const user = UserFactory.create();
      const likes = ['한식', '중식'];
      const dislikes = ['양식'];
      const updatedPreferences = UserPreferencesFactory.create({
        likes,
        dislikes,
      });
      userPreferenceService.updatePreferences.mockResolvedValue(
        updatedPreferences,
      );

      // Act
      const result = await service.updateEntityPreferences(
        user,
        likes,
        dislikes,
      );

      // Assert
      expect(result).toEqual(updatedPreferences);
      expect(userPreferenceService.updatePreferences).toHaveBeenCalledWith(
        user,
        likes,
        dislikes,
      );
    });

    it('should update only likes', async () => {
      // Arrange
      const user = UserFactory.create();
      const likes = ['한식'];
      const updatedPreferences = UserPreferencesFactory.create({
        likes,
        dislikes: [],
      });
      userPreferenceService.updatePreferences.mockResolvedValue(
        updatedPreferences,
      );

      // Act
      const result = await service.updateEntityPreferences(
        user,
        likes,
        undefined,
      );

      // Assert
      expect(result).toEqual(updatedPreferences);
      expect(userPreferenceService.updatePreferences).toHaveBeenCalledWith(
        user,
        likes,
        undefined,
      );
    });

    it('should update only dislikes', async () => {
      // Arrange
      const user = UserFactory.create();
      const dislikes = ['양식'];
      const updatedPreferences = UserPreferencesFactory.create({
        likes: [],
        dislikes,
      });
      userPreferenceService.updatePreferences.mockResolvedValue(
        updatedPreferences,
      );

      // Act
      const result = await service.updateEntityPreferences(
        user,
        undefined,
        dislikes,
      );

      // Assert
      expect(result).toEqual(updatedPreferences);
      expect(userPreferenceService.updatePreferences).toHaveBeenCalledWith(
        user,
        undefined,
        dislikes,
      );
    });
  });

  describe('updateEntityPreferencesAnalysis', () => {
    it('should delegate to userPreferenceService', async () => {
      // Arrange
      const user = UserFactory.create();
      const analysis = '한식을 선호하고 매운 음식을 좋아하시네요.';
      const updatedPreferences = UserPreferencesFactory.create();
      updatedPreferences.analysis = analysis;
      userPreferenceService.updatePreferencesAnalysis.mockResolvedValue(
        updatedPreferences,
      );

      // Act
      const result = await service.updateEntityPreferencesAnalysis(
        user,
        analysis,
      );

      // Assert
      expect(result).toEqual(updatedPreferences);
      expect(
        userPreferenceService.updatePreferencesAnalysis,
      ).toHaveBeenCalledWith(user, analysis);
    });
  });

  describe('searchAddress', () => {
    it('should delegate to addressSearchService', async () => {
      // Arrange
      const searchDto = { query: '강남구 테헤란로' };
      const searchResponse = {
        meta: { total_count: 1, pageable_count: 1, is_end: true },
        addresses: [
          {
            address: '서울특별시 강남구 테헤란로 123',
            roadAddress: '서울특별시 강남구 테헤란로 123',
            postalCode: '06234',
            latitude: '37.5012345',
            longitude: '127.0398765',
          },
        ],
      };
      addressSearchService.searchAddress.mockResolvedValue(searchResponse);

      // Act
      const result = await service.searchAddress(searchDto);

      // Assert
      expect(result).toEqual(searchResponse);
      expect(addressSearchService.searchAddress).toHaveBeenCalledWith(
        searchDto,
      );
    });
  });

  describe('updateEntitySingleAddress', () => {
    it('should delegate to userAddressService', async () => {
      // Arrange
      const user = UserFactory.create();
      const selectedAddress = {
        address: '서울특별시 강남구 테헤란로 123',
        roadAddress: '서울특별시 강남구 테헤란로 123',
        postalCode: '06234',
        latitude: '37.5012345',
        longitude: '127.0398765',
      };
      const updatedAddress = UserAddressFactory.create({ user });
      userAddressService.updateSingleAddress.mockResolvedValue(updatedAddress);

      // Act
      const result = await service.updateEntitySingleAddress(
        user,
        selectedAddress,
      );

      // Assert
      expect(result).toEqual(updatedAddress);
      expect(userAddressService.updateSingleAddress).toHaveBeenCalledWith(
        user,
        selectedAddress,
      );
    });
  });

  describe('getEntityAddresses', () => {
    it('should delegate to userAddressService', async () => {
      // Arrange
      const user = UserFactory.create();
      const addresses = [
        UserAddressFactory.create({ id: 1, user }),
        UserAddressFactory.create({ id: 2, user }),
      ];
      userAddressService.getAddresses.mockResolvedValue(addresses);

      // Act
      const result = await service.getEntityAddresses(user);

      // Assert
      expect(result).toEqual(addresses);
      expect(userAddressService.getAddresses).toHaveBeenCalledWith(user);
    });
  });

  describe('createEntityAddress', () => {
    it('should delegate to userAddressService', async () => {
      // Arrange
      const user = UserFactory.create();
      const dto = {
        selectedAddress: {
          address: '서울특별시 강남구 테헤란로 123',
          roadAddress: '서울특별시 강남구 테헤란로 123',
          postalCode: '06234',
          latitude: '37.5012345',
          longitude: '127.0398765',
        },
        alias: '회사',
      };
      const createdAddress = UserAddressFactory.create({ user, alias: '회사' });
      userAddressService.createAddress.mockResolvedValue(createdAddress);

      // Act
      const result = await service.createEntityAddress(user, dto);

      // Assert
      expect(result).toEqual(createdAddress);
      expect(userAddressService.createAddress).toHaveBeenCalledWith(user, dto);
    });
  });

  describe('updateEntityAddress', () => {
    it('should delegate to userAddressService', async () => {
      // Arrange
      const user = UserFactory.create();
      const addressId = 1;
      const dto = { alias: '새로운 별칭', isDefault: true };
      const updatedAddress = UserAddressFactory.create({
        id: addressId,
        user,
        alias: '새로운 별칭',
      });
      userAddressService.updateAddress.mockResolvedValue(updatedAddress);

      // Act
      const result = await service.updateEntityAddress(user, addressId, dto);

      // Assert
      expect(result).toEqual(updatedAddress);
      expect(userAddressService.updateAddress).toHaveBeenCalledWith(
        user,
        addressId,
        dto,
      );
    });
  });

  describe('deleteEntityAddresses', () => {
    it('should delegate to userAddressService', async () => {
      // Arrange
      const user = UserFactory.create();
      const addressIds = [1, 2, 3];
      userAddressService.deleteAddresses.mockResolvedValue(undefined);

      // Act
      await service.deleteEntityAddresses(user, addressIds);

      // Assert
      expect(userAddressService.deleteAddresses).toHaveBeenCalledWith(
        user,
        addressIds,
      );
    });
  });

  describe('setEntityDefaultAddress', () => {
    it('should delegate to userAddressService', async () => {
      // Arrange
      const user = UserFactory.create();
      const addressId = 1;
      const defaultAddress = UserAddressFactory.create({
        id: addressId,
        user,
        isDefault: true,
      });
      userAddressService.setDefaultAddress.mockResolvedValue(defaultAddress);

      // Act
      const result = await service.setEntityDefaultAddress(user, addressId);

      // Assert
      expect(result).toEqual(defaultAddress);
      expect(userAddressService.setDefaultAddress).toHaveBeenCalledWith(
        user,
        addressId,
      );
    });
  });

  describe('setEntitySearchAddress', () => {
    it('should delegate to userAddressService', async () => {
      // Arrange
      const user = UserFactory.create();
      const addressId = 1;
      const searchAddress = UserAddressFactory.create({
        id: addressId,
        user,
        isSearchAddress: true,
      });
      userAddressService.setSearchAddress.mockResolvedValue(searchAddress);

      // Act
      const result = await service.setEntitySearchAddress(user, addressId);

      // Assert
      expect(result).toEqual(searchAddress);
      expect(userAddressService.setSearchAddress).toHaveBeenCalledWith(
        user,
        addressId,
      );
    });
  });

  describe('getEntityDefaultAddress', () => {
    it('should return default address when it exists', async () => {
      // Arrange
      const user = UserFactory.create();
      const defaultAddress = UserAddressFactory.createDefault(user);
      userAddressService.getDefaultAddress.mockResolvedValue(defaultAddress);

      // Act
      const result = await service.getEntityDefaultAddress(user);

      // Assert
      expect(result).toEqual(defaultAddress);
      expect(userAddressService.getDefaultAddress).toHaveBeenCalledWith(user);
    });

    it('should return null when no default address exists', async () => {
      // Arrange
      const user = UserFactory.create();
      userAddressService.getDefaultAddress.mockResolvedValue(null);

      // Act
      const result = await service.getEntityDefaultAddress(user);

      // Assert
      expect(result).toBeNull();
      expect(userAddressService.getDefaultAddress).toHaveBeenCalledWith(user);
    });
  });

  describe('updateEntityName', () => {
    it('should update user name and save', async () => {
      // Arrange
      const user = UserFactory.create({ name: 'Old Name' });
      const newName = 'New Name';
      const updatedUser = { ...user, name: newName };
      userRepository.save.mockResolvedValue(updatedUser);

      // Act
      const result = await service.updateEntityName(user, newName);

      // Assert
      expect(user.name).toBe(newName);
      expect(result.name).toBe(newName);
      expect(userRepository.save).toHaveBeenCalledWith(user);
    });

    it('should handle null name', async () => {
      // Arrange
      const user = UserFactory.create({ name: 'Existing Name' });
      const newName = null as unknown as string;
      const updatedUser = { ...user, name: newName };
      userRepository.save.mockResolvedValue(updatedUser);

      // Act
      const result = await service.updateEntityName(user, newName);

      // Assert
      expect(user.name).toBeNull();
      expect(result.name).toBeNull();
    });
  });
});
