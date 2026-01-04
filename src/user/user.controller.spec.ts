import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import {
  UserFactory,
  UserAddressFactory,
  UserPreferencesFactory,
} from '../../test/factories/entity.factory';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { SearchAddressDto } from './dto/search-address.dto';
import { UpdateSingleAddressDto } from './dto/update-single-address.dto';
import { UpdateUserNameDto } from './dto/update-user-name.dto';
import { CreateUserAddressDto } from './dto/create-user-address.dto';
import { UpdateUserAddressDto } from './dto/update-user-address.dto';
import { DeleteUserAddressesDto } from './dto/delete-user-addresses.dto';
import { AddressSearchResult } from './interfaces/address-search-result.interface';

describe('UserController', () => {
  let controller: UserController;
  let mockUserService: jest.Mocked<UserService>;

  const mockAuthUser: AuthUserPayload = {
    email: 'test@example.com',
    role: 'USER',
  };

  beforeEach(async () => {
    mockUserService = {
      getAuthenticatedEntity: jest.fn(),
      getEntityPreferences: jest.fn(),
      updateEntityPreferences: jest.fn(),
      searchAddress: jest.fn(),
      updateEntitySingleAddress: jest.fn(),
      updateEntityName: jest.fn(),
      deleteUser: jest.fn(),
      getEntityDefaultAddress: jest.fn(),
      getEntityAddresses: jest.fn(),
      createEntityAddress: jest.fn(),
      updateEntityAddress: jest.fn(),
      deleteEntityAddresses: jest.fn(),
      setEntityDefaultAddress: jest.fn(),
      setEntitySearchAddress: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreferences', () => {
    it('should return user preferences when user exists', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const preferences = UserPreferencesFactory.create();
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityPreferences.mockResolvedValue(preferences);

      // Act
      const result = await controller.getPreferences(mockAuthUser);

      // Assert
      expect(result).toEqual({ preferences });
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.getEntityPreferences).toHaveBeenCalledWith(user);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange
      mockUserService.getAuthenticatedEntity.mockRejectedValue(
        new NotFoundException('User with email test@example.com not found'),
      );

      // Act & Assert
      await expect(controller.getPreferences(mockAuthUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.getEntityPreferences).not.toHaveBeenCalled();
    });
  });

  describe('upsertPreferences', () => {
    it('should update user preferences successfully', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto: UpdatePreferencesDto = {
        likes: ['한식', '중식'],
        dislikes: ['양식'],
      };
      const updatedPreferences = UserPreferencesFactory.create(dto);
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.updateEntityPreferences.mockResolvedValue(
        updatedPreferences,
      );

      // Act
      const result = await controller.upsertPreferences(dto, mockAuthUser);

      // Assert
      expect(result).toEqual({ preferences: updatedPreferences });
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.updateEntityPreferences).toHaveBeenCalledWith(
        user,
        dto.likes,
        dto.dislikes,
      );
    });

    it('should update preferences with only likes', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto: UpdatePreferencesDto = {
        likes: ['한식'],
      };
      const updatedPreferences = UserPreferencesFactory.create({
        likes: ['한식'],
        dislikes: [],
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.updateEntityPreferences.mockResolvedValue(
        updatedPreferences,
      );

      // Act
      const result = await controller.upsertPreferences(dto, mockAuthUser);

      // Assert
      expect(result).toEqual({ preferences: updatedPreferences });
      expect(mockUserService.updateEntityPreferences).toHaveBeenCalledWith(
        user,
        dto.likes,
        undefined,
      );
    });

    it('should update preferences with only dislikes', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto: UpdatePreferencesDto = {
        dislikes: ['양식'],
      };
      const updatedPreferences = UserPreferencesFactory.create({
        likes: [],
        dislikes: ['양식'],
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.updateEntityPreferences.mockResolvedValue(
        updatedPreferences,
      );

      // Act
      const result = await controller.upsertPreferences(dto, mockAuthUser);

      // Assert
      expect(result).toEqual({ preferences: updatedPreferences });
      expect(mockUserService.updateEntityPreferences).toHaveBeenCalledWith(
        user,
        undefined,
        dto.dislikes,
      );
    });
  });

  describe('searchAddress', () => {
    it('should return address search results', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '강남구 테헤란로' } as any;
      const searchResponse = {
        meta: {
          total_count: 1,
          pageable_count: 1,
          is_end: true,
        },
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
      mockUserService.searchAddress.mockResolvedValue(searchResponse);

      // Act
      const result = await controller.searchAddress(searchDto);

      // Assert
      expect(result).toEqual(searchResponse);
      expect(mockUserService.searchAddress).toHaveBeenCalledWith(searchDto);
    });

    it('should return empty results when no addresses found', async () => {
      // Arrange
      const searchDto: SearchAddressDto = { query: '존재하지않는주소' } as any;
      const searchResponse = {
        meta: {
          total_count: 0,
          pageable_count: 0,
          is_end: true,
        },
        addresses: [],
      };
      mockUserService.searchAddress.mockResolvedValue(searchResponse);

      // Act
      const result = await controller.searchAddress(searchDto);

      // Assert
      expect(result).toEqual(searchResponse);
      expect(result.addresses).toHaveLength(0);
    });
  });

  describe('updateSingleAddress', () => {
    it('should update single address successfully', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const selectedAddress: AddressSearchResult = {
        address: '서울특별시 강남구 테헤란로 123',
        roadAddress: '서울특별시 강남구 테헤란로 123',
        postalCode: '06234',
        latitude: '37.5012345',
        longitude: '127.0398765',
      };
      const updateDto: UpdateSingleAddressDto = { selectedAddress };
      const updatedAddress = UserAddressFactory.create({
        user,
        roadAddress:
          selectedAddress.roadAddress ?? '서울특별시 강남구 테헤란로 123',
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.updateEntitySingleAddress.mockResolvedValue(
        updatedAddress,
      );

      // Act
      const result = await controller.updateSingleAddress(
        updateDto,
        mockAuthUser,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.roadAddress).toBe(selectedAddress.roadAddress);
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.updateEntitySingleAddress).toHaveBeenCalledWith(
        user,
        selectedAddress,
      );
    });
  });

  describe('updateUser', () => {
    it('should update user name successfully', async () => {
      // Arrange
      const user = UserFactory.create({
        email: mockAuthUser.email,
        name: 'Old Name',
      });
      const updateDto: UpdateUserNameDto = { name: 'New Name' };
      const updatedUser = { ...user, name: updateDto.name };
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.updateEntityName.mockResolvedValue(updatedUser as any);

      // Act
      const result = await controller.updateUser(updateDto, mockAuthUser);

      // Assert
      expect(result).toEqual({ name: updateDto.name });
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.updateEntityName).toHaveBeenCalledWith(
        user,
        updateDto.name,
      );
    });
  });

  describe('deleteCurrentUser', () => {
    it('should soft delete user successfully', async () => {
      // Arrange
      mockUserService.deleteUser.mockResolvedValue(undefined);

      // Act
      const result = await controller.deleteCurrentUser(mockAuthUser);

      // Assert
      expect(result).toEqual({ message: '회원 탈퇴가 완료되었습니다.' });
      expect(mockUserService.deleteUser).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
    });

    it('should throw error when user not found', async () => {
      // Arrange
      mockUserService.deleteUser.mockRejectedValue(
        new NotFoundException('사용자를 찾을 수 없습니다.'),
      );

      // Act & Assert
      await expect(controller.deleteCurrentUser(mockAuthUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockUserService.deleteUser).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
    });
  });

  describe('getDefaultAddress', () => {
    it('should return default address when it exists', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const defaultAddress = UserAddressFactory.createDefault(user);
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityDefaultAddress.mockResolvedValue(defaultAddress);

      // Act
      const result = await controller.getDefaultAddress(mockAuthUser);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe(defaultAddress.id);
      expect(result?.isDefault).toBe(true);
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.getEntityDefaultAddress).toHaveBeenCalledWith(
        user,
      );
    });

    it('should return null when no default address exists', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityDefaultAddress.mockResolvedValue(null);

      // Act
      const result = await controller.getDefaultAddress(mockAuthUser);

      // Assert
      expect(result).toBeNull();
      expect(mockUserService.getEntityDefaultAddress).toHaveBeenCalledWith(
        user,
      );
    });
  });

  describe('getUserAddresses', () => {
    it('should return list of user addresses', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addresses = [
        UserAddressFactory.create({ id: 1, user }),
        UserAddressFactory.create({ id: 2, user }),
      ];
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityAddresses.mockResolvedValue(addresses);

      // Act
      const result = await controller.getUserAddresses(mockAuthUser);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.getEntityAddresses).toHaveBeenCalledWith(user);
    });

    it('should return empty array when user has no addresses', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityAddresses.mockResolvedValue([]);

      // Act
      const result = await controller.getUserAddresses(mockAuthUser);

      // Assert
      expect(result).toEqual([]);
      expect(mockUserService.getEntityAddresses).toHaveBeenCalledWith(user);
    });

    it('should correctly convert latitude and longitude from strings', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addressWithStringCoords = UserAddressFactory.create({
        user,
        latitude: '37.5012345' as any,
        longitude: '127.0398765' as any,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityAddresses.mockResolvedValue([
        addressWithStringCoords,
      ]);

      // Act
      const result = await controller.getUserAddresses(mockAuthUser);

      // Assert
      expect(result[0].latitude).toBe(37.5012345);
      expect(result[0].longitude).toBe(127.0398765);
      expect(typeof result[0].latitude).toBe('number');
      expect(typeof result[0].longitude).toBe('number');
    });
  });

  describe('createUserAddress', () => {
    it('should create user address successfully', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto: CreateUserAddressDto = {
        selectedAddress: {
          address: '서울특별시 강남구 테헤란로 123',
          roadAddress: '서울특별시 강남구 테헤란로 123',
          postalCode: '06234',
          latitude: '37.5012345',
          longitude: '127.0398765',
        },
        alias: '회사',
        isDefault: true,
        isSearchAddress: false,
      };
      const createdAddress = UserAddressFactory.create({
        user,
        alias: dto.alias,
        isDefault: true,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.createEntityAddress.mockResolvedValue(createdAddress);

      // Act
      const result = await controller.createUserAddress(dto, mockAuthUser);

      // Assert
      expect(result).toBeDefined();
      expect(result.alias).toBe('회사');
      expect(result.isDefault).toBe(true);
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.createEntityAddress).toHaveBeenCalledWith(
        user,
        dto,
      );
    });

    it('should create address without alias', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto: CreateUserAddressDto = {
        selectedAddress: {
          address: '서울특별시 강남구 테헤란로 123',
          roadAddress: '서울특별시 강남구 테헤란로 123',
          postalCode: '06234',
          latitude: '37.5012345',
          longitude: '127.0398765',
        },
      };
      const createdAddress = UserAddressFactory.create({ user, alias: null });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.createEntityAddress.mockResolvedValue(createdAddress);

      // Act
      const result = await controller.createUserAddress(dto, mockAuthUser);

      // Assert
      expect(result.alias).toBeNull();
      expect(mockUserService.createEntityAddress).toHaveBeenCalledWith(
        user,
        dto,
      );
    });
  });

  describe('updateUserAddress', () => {
    it('should update user address successfully', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addressId = '1';
      const dto: UpdateUserAddressDto = {
        alias: '새로운 별칭',
        isDefault: true,
      };
      const updatedAddress = UserAddressFactory.create({
        id: 1,
        user,
        alias: dto.alias,
        isDefault: true,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.updateEntityAddress.mockResolvedValue(updatedAddress);

      // Act
      const result = await controller.updateUserAddress(
        addressId,
        dto,
        mockAuthUser,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.alias).toBe('새로운 별칭');
      expect(result.isDefault).toBe(true);
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.updateEntityAddress).toHaveBeenCalledWith(
        user,
        1,
        dto,
      );
    });

    it('should parse address id correctly', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addressId = '999';
      const dto: UpdateUserAddressDto = { alias: 'test' };
      const updatedAddress = UserAddressFactory.create({ id: 999, user });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.updateEntityAddress.mockResolvedValue(updatedAddress);

      // Act
      await controller.updateUserAddress(addressId, dto, mockAuthUser);

      // Assert
      expect(mockUserService.updateEntityAddress).toHaveBeenCalledWith(
        user,
        999,
        dto,
      );
    });
  });

  describe('deleteUserAddresses', () => {
    it('should delete multiple addresses successfully', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto: DeleteUserAddressesDto = { ids: [1, 2, 3] };
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.deleteEntityAddresses.mockResolvedValue(undefined);

      // Act
      const result = await controller.deleteUserAddresses(dto, mockAuthUser);

      // Assert
      expect(result).toEqual({ message: '주소가 삭제되었습니다.' });
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.deleteEntityAddresses).toHaveBeenCalledWith(
        user,
        dto.ids,
      );
    });

    it('should delete single address', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto: DeleteUserAddressesDto = { ids: [1] };
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.deleteEntityAddresses.mockResolvedValue(undefined);

      // Act
      const result = await controller.deleteUserAddresses(dto, mockAuthUser);

      // Assert
      expect(result).toEqual({ message: '주소가 삭제되었습니다.' });
      expect(mockUserService.deleteEntityAddresses).toHaveBeenCalledWith(user, [
        1,
      ]);
    });
  });

  describe('setDefaultAddress', () => {
    it('should set default address successfully', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addressId = '1';
      const defaultAddress = UserAddressFactory.create({
        id: 1,
        user,
        isDefault: true,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.setEntityDefaultAddress.mockResolvedValue(defaultAddress);

      // Act
      const result = await controller.setDefaultAddress(
        addressId,
        mockAuthUser,
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.isDefault).toBe(true);
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.setEntityDefaultAddress).toHaveBeenCalledWith(
        user,
        1,
      );
    });

    it('should parse address id correctly for setting default', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addressId = '42';
      const defaultAddress = UserAddressFactory.create({
        id: 42,
        user,
        isDefault: true,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.setEntityDefaultAddress.mockResolvedValue(defaultAddress);

      // Act
      await controller.setDefaultAddress(addressId, mockAuthUser);

      // Assert
      expect(mockUserService.setEntityDefaultAddress).toHaveBeenCalledWith(
        user,
        42,
      );
    });
  });

  describe('setSearchAddress', () => {
    it('should set search address successfully', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addressId = '1';
      const searchAddress = UserAddressFactory.create({
        id: 1,
        user,
        isSearchAddress: true,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.setEntitySearchAddress.mockResolvedValue(searchAddress);

      // Act
      const result = await controller.setSearchAddress(addressId, mockAuthUser);

      // Assert
      expect(result).toBeDefined();
      expect(result.isSearchAddress).toBe(true);
      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.setEntitySearchAddress).toHaveBeenCalledWith(
        user,
        1,
      );
    });

    it('should parse address id correctly for setting search address', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addressId = '99';
      const searchAddress = UserAddressFactory.create({
        id: 99,
        user,
        isSearchAddress: true,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.setEntitySearchAddress.mockResolvedValue(searchAddress);

      // Act
      await controller.setSearchAddress(addressId, mockAuthUser);

      // Assert
      expect(mockUserService.setEntitySearchAddress).toHaveBeenCalledWith(
        user,
        99,
      );
    });
  });

  describe('toAddressResponseDto (private method via public endpoints)', () => {
    it('should handle numeric latitude and longitude correctly', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const address = UserAddressFactory.create({
        user,
        latitude: 37.5012345,
        longitude: 127.0398765,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityAddresses.mockResolvedValue([address]);

      // Act
      const result = await controller.getUserAddresses(mockAuthUser);

      // Assert
      expect(result[0].latitude).toBe(37.5012345);
      expect(result[0].longitude).toBe(127.0398765);
      expect(typeof result[0].latitude).toBe('number');
      expect(typeof result[0].longitude).toBe('number');
    });

    it('should convert string latitude and longitude to numbers', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const address = UserAddressFactory.create({
        user,
        latitude: '37.5012345' as any,
        longitude: '127.0398765' as any,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityAddresses.mockResolvedValue([address]);

      // Act
      const result = await controller.getUserAddresses(mockAuthUser);

      // Assert
      expect(result[0].latitude).toBe(37.5012345);
      expect(result[0].longitude).toBe(127.0398765);
    });

    it('should include all address fields in response', async () => {
      // Arrange
      const user = UserFactory.create({ email: mockAuthUser.email });
      const address = UserAddressFactory.create({
        id: 123,
        user,
        roadAddress: '서울특별시 강남구 테헤란로 123',
        postalCode: '06234',
        latitude: 37.5012345,
        longitude: 127.0398765,
        isDefault: true,
        isSearchAddress: false,
        alias: '회사',
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityAddresses.mockResolvedValue([address]);

      // Act
      const result = await controller.getUserAddresses(mockAuthUser);

      // Assert
      expect(result[0]).toMatchObject({
        id: 123,
        roadAddress: '서울특별시 강남구 테헤란로 123',
        postalCode: '06234',
        latitude: 37.5012345,
        longitude: 127.0398765,
        isDefault: true,
        isSearchAddress: false,
        alias: '회사',
      });
      expect(result[0].createdAt).toBeDefined();
      expect(result[0].updatedAt).toBeDefined();
    });
  });
});
