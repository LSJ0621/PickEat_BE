import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';
import { AuthUserPayload } from '@/auth/decorators/current-user.decorator';
import {
  UserFactory,
  UserAddressFactory,
  UserPreferencesFactory,
} from '../../../test/factories/entity.factory';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';
import { SearchAddressDto } from '../dto/search-address.dto';
import { UpdateSingleAddressDto } from '../dto/update-single-address.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { CreateUserAddressDto } from '../dto/create-user-address.dto';
import { UpdateUserAddressDto } from '../dto/update-user-address.dto';
import { DeleteUserAddressesDto } from '../dto/delete-user-addresses.dto';
import { AddressSearchResult } from '../interfaces/address-search-result.interface';

describe('UserController', () => {
  let controller: UserController;
  let mockUserService: jest.Mocked<UserService>;

  const mockAuthUser: AuthUserPayload = {
    sub: 1,
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
      updateProfile: jest.fn(),
      updateEntityLanguage: jest.fn(),
      deleteUser: jest.fn(),
      getEntityDefaultAddress: jest.fn(),
      getEntityAddresses: jest.fn(),
      createEntityAddress: jest.fn(),
      updateEntityAddress: jest.fn(),
      deleteEntityAddresses: jest.fn(),
      setEntityDefaultAddress: jest.fn(),
      setEntitySearchAddress: jest.fn(),
    } as unknown as jest.Mocked<UserService>;

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
    it('should call service with user entity and return preferences', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const preferences = UserPreferencesFactory.create();
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityPreferences.mockResolvedValue(preferences);

      const result = await controller.getPreferences(mockAuthUser);

      expect(mockUserService.getAuthenticatedEntity).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(mockUserService.getEntityPreferences).toHaveBeenCalledWith(user);
      expect(result).toEqual({ preferences });
    });

    it('should propagate exception from service', async () => {
      mockUserService.getAuthenticatedEntity.mockRejectedValue(
        new NotFoundException(),
      );

      await expect(controller.getPreferences(mockAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsertPreferences', () => {
    it('should call service with likes and dislikes and return updated preferences', async () => {
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

      const result = await controller.upsertPreferences(dto, mockAuthUser);

      expect(mockUserService.updateEntityPreferences).toHaveBeenCalledWith(
        user,
        dto.likes,
        dto.dislikes,
      );
      expect(result).toEqual({ preferences: updatedPreferences });
    });

    it('should propagate exception from service', async () => {
      const dto: UpdatePreferencesDto = { likes: ['한식'] };
      mockUserService.getAuthenticatedEntity.mockRejectedValue(
        new NotFoundException(),
      );

      await expect(
        controller.upsertPreferences(dto, mockAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchAddress', () => {
    it('should delegate to service and return results', async () => {
      const searchDto: SearchAddressDto = { query: '강남구 테헤란로' };
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
      mockUserService.searchAddress.mockResolvedValue(searchResponse);

      const result = await controller.searchAddress(searchDto);

      expect(mockUserService.searchAddress).toHaveBeenCalledWith(searchDto);
      expect(result).toEqual(searchResponse);
    });
  });

  describe('updateSingleAddress', () => {
    it('should call service and return address response dto', async () => {
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

      const result = await controller.updateSingleAddress(
        updateDto,
        mockAuthUser,
      );

      expect(mockUserService.updateEntitySingleAddress).toHaveBeenCalledWith(
        user,
        selectedAddress,
      );
      expect(result.roadAddress).toBe(selectedAddress.roadAddress);
    });
  });

  describe('updateUser', () => {
    it('should call updateProfile and return name, birthDate, gender', async () => {
      const user = UserFactory.create({ id: 1, email: mockAuthUser.email });
      const updateDto: UpdateUserDto = {
        name: 'New Name',
        birthDate: '1990-06-15',
        gender: 'male',
      };
      const updatedUser = {
        ...user,
        name: 'New Name',
        birthDate: '1990-06-15',
        gender: 'male' as const,
      };
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.updateProfile.mockResolvedValue(updatedUser);

      const result = await controller.updateUser(updateDto, mockAuthUser);

      expect(mockUserService.updateProfile).toHaveBeenCalledWith(1, updateDto);
      expect(result).toEqual({
        name: 'New Name',
        birthDate: '1990-06-15',
        gender: 'male',
      });
    });

    it('should propagate exception from service', async () => {
      const updateDto: UpdateUserDto = { name: 'New Name' };
      mockUserService.getAuthenticatedEntity.mockRejectedValue(
        new NotFoundException(),
      );

      await expect(
        controller.updateUser(updateDto, mockAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCurrentUser', () => {
    it('should call deleteUser and return withdrawal message code', async () => {
      mockUserService.deleteUser.mockResolvedValue(undefined);

      const result = await controller.deleteCurrentUser(mockAuthUser);

      expect(mockUserService.deleteUser).toHaveBeenCalledWith(
        mockAuthUser.email,
      );
      expect(result).toEqual({ messageCode: 'USER_WITHDRAWAL_COMPLETED' });
    });

    it('should propagate exception from service', async () => {
      mockUserService.deleteUser.mockRejectedValue(new NotFoundException());

      await expect(controller.deleteCurrentUser(mockAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateLanguage', () => {
    it('should call service and return language changed message code', async () => {
      const dto = { language: 'en' as const };
      mockUserService.updateEntityLanguage.mockResolvedValue(undefined);

      const result = await controller.updateLanguage(dto, mockAuthUser);

      expect(mockUserService.updateEntityLanguage).toHaveBeenCalledWith(
        mockAuthUser.email,
        'en',
      );
      expect(result).toEqual({ messageCode: 'USER_LANGUAGE_CHANGED' });
    });

    it('should propagate exception from service', async () => {
      const dto = { language: 'ko' as const };
      mockUserService.updateEntityLanguage.mockRejectedValue(
        new NotFoundException(),
      );

      await expect(
        controller.updateLanguage(dto, mockAuthUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDefaultAddress', () => {
    it('should return default address response dto when address exists', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const defaultAddress = UserAddressFactory.createDefault(user);
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityDefaultAddress.mockResolvedValue(defaultAddress);

      const result = await controller.getDefaultAddress(mockAuthUser);

      expect(mockUserService.getEntityDefaultAddress).toHaveBeenCalledWith(
        user,
      );
      expect(result?.id).toBe(defaultAddress.id);
      expect(result?.isDefault).toBe(true);
    });

    it('should return null when no default address exists', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityDefaultAddress.mockResolvedValue(null);

      const result = await controller.getDefaultAddress(mockAuthUser);

      expect(result).toBeNull();
    });
  });

  describe('getUserAddresses', () => {
    it('should return mapped address list', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addresses = [
        UserAddressFactory.create({ id: 1, user }),
        UserAddressFactory.create({ id: 2, user }),
      ];
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityAddresses.mockResolvedValue(addresses);

      const result = await controller.getUserAddresses(mockAuthUser);

      expect(mockUserService.getEntityAddresses).toHaveBeenCalledWith(user);
      expect(result.addresses).toHaveLength(2);
      expect(result.addresses[0].id).toBe(1);
      expect(result.addresses[1].id).toBe(2);
    });

    it('should convert string latitude and longitude to numbers', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const addressWithStringCoords = UserAddressFactory.create({
        user,
        latitude: '37.5012345' as unknown as number,
        longitude: '127.0398765' as unknown as number,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.getEntityAddresses.mockResolvedValue([
        addressWithStringCoords,
      ]);

      const result = await controller.getUserAddresses(mockAuthUser);

      expect(typeof result.addresses[0].latitude).toBe('number');
      expect(result.addresses[0].latitude).toBe(37.5012345);
      expect(typeof result.addresses[0].longitude).toBe('number');
      expect(result.addresses[0].longitude).toBe(127.0398765);
    });
  });

  describe('createUserAddress', () => {
    it('should call service and return created address response dto', async () => {
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

      const result = await controller.createUserAddress(dto, mockAuthUser);

      expect(mockUserService.createEntityAddress).toHaveBeenCalledWith(
        user,
        dto,
      );
      expect(result.alias).toBe('회사');
      expect(result.isDefault).toBe(true);
    });
  });

  describe('updateUserAddress', () => {
    it('should parse address id and call service with parsed numeric id', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
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

      const result = await controller.updateUserAddress('1', dto, mockAuthUser);

      expect(mockUserService.updateEntityAddress).toHaveBeenCalledWith(
        user,
        1,
        dto,
      );
      expect(result.alias).toBe('새로운 별칭');
      expect(result.isDefault).toBe(true);
    });
  });

  describe('batchDeleteUserAddresses', () => {
    it('should call service with ids and return address deleted message code', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const dto: DeleteUserAddressesDto = { ids: [1, 2, 3] };
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.deleteEntityAddresses.mockResolvedValue(undefined);

      const result = await controller.batchDeleteUserAddresses(
        dto,
        mockAuthUser,
      );

      expect(mockUserService.deleteEntityAddresses).toHaveBeenCalledWith(
        user,
        dto.ids,
      );
      expect(result).toEqual({ messageCode: 'USER_ADDRESS_DELETED' });
    });
  });

  describe('setDefaultAddress', () => {
    it('should parse address id and call service with parsed numeric id', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const defaultAddress = UserAddressFactory.create({
        id: 42,
        user,
        isDefault: true,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.setEntityDefaultAddress.mockResolvedValue(defaultAddress);

      const result = await controller.setDefaultAddress('42', mockAuthUser);

      expect(mockUserService.setEntityDefaultAddress).toHaveBeenCalledWith(
        user,
        42,
      );
      expect(result.isDefault).toBe(true);
    });
  });

  describe('setSearchAddress', () => {
    it('should parse address id and call service with parsed numeric id', async () => {
      const user = UserFactory.create({ email: mockAuthUser.email });
      const searchAddress = UserAddressFactory.create({
        id: 99,
        user,
        isSearchAddress: true,
      });
      mockUserService.getAuthenticatedEntity.mockResolvedValue(user);
      mockUserService.setEntitySearchAddress.mockResolvedValue(searchAddress);

      const result = await controller.setSearchAddress('99', mockAuthUser);

      expect(mockUserService.setEntitySearchAddress).toHaveBeenCalledWith(
        user,
        99,
      );
      expect(result.isSearchAddress).toBe(true);
    });
  });
});
