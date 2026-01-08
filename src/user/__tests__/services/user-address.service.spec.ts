import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { USER_LIMITS } from '@/common/constants/business.constants';
import {
  UserAddressFactory,
  UserFactory,
} from '../../../../test/factories/entity.factory';
import {
  createMockRepository,
  createMockUpdateResult,
} from '../../../../test/mocks/repository.mock';
import { UserAddress } from '../../entities/user-address.entity';
import { UserAddressService } from '../../services/user-address.service';

describe('UserAddressService', () => {
  let service: UserAddressService;
  let userAddressRepository: ReturnType<
    typeof createMockRepository<UserAddress>
  >;

  beforeEach(async () => {
    jest.clearAllMocks();
    userAddressRepository = createMockRepository<UserAddress>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAddressService,
        {
          provide: getRepositoryToken(UserAddress),
          useValue: userAddressRepository,
        },
      ],
    }).compile();

    service = module.get<UserAddressService>(UserAddressService);
  });

  describe('getAddresses', () => {
    it('should return user addresses ordered by creation date', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const addresses = [
        UserAddressFactory.create({ id: 1, user }),
        UserAddressFactory.create({ id: 2, user }),
      ];
      userAddressRepository.find.mockResolvedValue(addresses);

      // Act
      const result = await service.getAddresses(user);

      // Assert
      expect(result).toEqual(addresses);
      expect(userAddressRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user: { id: 1 } }),
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('should return empty array if no addresses exist', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      userAddressRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.getAddresses(user);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('createAddress', () => {
    it('should create first address as default and search address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const dto = {
        selectedAddress: {
          address: '서울특별시 강남구',
          roadAddress: '서울특별시 강남구 테헤란로 123',
          postalCode: '06234',
          latitude: '37.5012345',
          longitude: '127.0398765',
        },
        alias: undefined,
        isDefault: undefined,
        isSearchAddress: undefined,
      };

      userAddressRepository.count.mockResolvedValue(0);
      const createdAddress = UserAddressFactory.create({
        isDefault: true,
        isSearchAddress: true,
      });
      userAddressRepository.create.mockReturnValue(createdAddress);
      userAddressRepository.save.mockResolvedValue(createdAddress);

      // Act
      const result = await service.createAddress(user, dto);

      // Assert
      expect(result.isDefault).toBe(true);
      expect(result.isSearchAddress).toBe(true);
      expect(userAddressRepository.save).toHaveBeenCalled();
    });

    it('should throw error when max address limit reached', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const dto = {
        selectedAddress: {
          address: '서울특별시 강남구',
          roadAddress: '서울특별시 강남구 테헤란로 123',
          postalCode: '06234',
          latitude: '37.5012345',
          longitude: '127.0398765',
        },
        alias: undefined,
      };

      userAddressRepository.count.mockResolvedValue(USER_LIMITS.MAX_ADDRESSES);

      // Act & Assert
      await expect(service.createAddress(user, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createAddress(user, dto)).rejects.toThrow(
        `주소는 최대 ${USER_LIMITS.MAX_ADDRESSES}개까지만 저장할 수 있습니다.`,
      );
    });

    it('should unset previous default when new default is created', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const dto = {
        selectedAddress: {
          address: '서울특별시 강남구',
          roadAddress: '서울특별시 강남구 테헤란로 123',
          postalCode: '06234',
          latitude: '37.5012345',
          longitude: '127.0398765',
        },
        alias: '회사',
        isDefault: true,
      };

      userAddressRepository.count.mockResolvedValue(1);
      userAddressRepository.update.mockResolvedValue(createMockUpdateResult(1));
      const createdAddress = UserAddressFactory.create();
      userAddressRepository.create.mockReturnValue(createdAddress);
      userAddressRepository.save.mockResolvedValue(createdAddress);

      // Act
      await service.createAddress(user, dto);

      // Assert
      expect(userAddressRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ isDefault: true }),
        { isDefault: false },
      );
    });

    it('should use roadAddress if available, otherwise use address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const dto = {
        selectedAddress: {
          address: '지번주소',
          roadAddress: '도로명주소',
          postalCode: '06234',
          latitude: '37.5012345',
          longitude: '127.0398765',
        },
        alias: undefined,
      };

      userAddressRepository.count.mockResolvedValue(0);
      const createdAddress = UserAddressFactory.create({
        roadAddress: '도로명주소',
      });
      userAddressRepository.create.mockReturnValue(createdAddress);
      userAddressRepository.save.mockResolvedValue(createdAddress);

      // Act
      await service.createAddress(user, dto);

      // Assert
      expect(userAddressRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          roadAddress: '도로명주소',
        }),
      );
    });

    it('should parse latitude and longitude to numbers', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const dto = {
        selectedAddress: {
          address: '서울',
          roadAddress: '서울',
          postalCode: '06234',
          latitude: '37.5012345',
          longitude: '127.0398765',
        },
        alias: undefined,
      };

      userAddressRepository.count.mockResolvedValue(0);
      const createdAddress = UserAddressFactory.create();
      userAddressRepository.create.mockReturnValue(createdAddress);
      userAddressRepository.save.mockResolvedValue(createdAddress);

      // Act
      await service.createAddress(user, dto);

      // Assert
      expect(userAddressRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: 37.5012345,
          longitude: 127.0398765,
        }),
      );
    });
  });

  describe('updateAddress', () => {
    it('should update address successfully', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const address = UserAddressFactory.create({ id: 1, user });
      const dto = {
        roadAddress: '새 주소',
        alias: '새 별칭',
      };

      userAddressRepository.findOne.mockResolvedValue(address);
      userAddressRepository.save.mockResolvedValue({ ...address, ...dto });

      // Act
      const result = await service.updateAddress(user, 1, dto);

      // Assert
      expect(result.roadAddress).toBe('새 주소');
      expect(result.alias).toBe('새 별칭');
    });

    it('should throw NotFoundException when address not found', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      userAddressRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.updateAddress(user, 999, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should unset previous default when setting new default', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const address = UserAddressFactory.create({
        id: 1,
        user,
        isDefault: false,
      });
      const dto = { isDefault: true };

      userAddressRepository.findOne.mockResolvedValue(address);
      userAddressRepository.update.mockResolvedValue(createMockUpdateResult(1));
      userAddressRepository.save.mockResolvedValue({
        ...address,
        isDefault: true,
      });

      // Act
      await service.updateAddress(user, 1, dto);

      // Assert
      expect(userAddressRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ isDefault: true }),
        { isDefault: false },
      );
    });

    it('should update all provided fields', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const address = UserAddressFactory.create({ id: 1, user });
      const dto = {
        roadAddress: '새 주소',
        latitude: 37.123,
        longitude: 127.456,
        alias: '새 별칭',
        isDefault: true,
        isSearchAddress: true,
      };

      userAddressRepository.findOne.mockResolvedValue(address);
      userAddressRepository.update.mockResolvedValue(createMockUpdateResult(1));
      userAddressRepository.save.mockResolvedValue({ ...address, ...dto });

      // Act
      await service.updateAddress(user, 1, dto);

      // Assert
      expect(userAddressRepository.save).toHaveBeenCalledWith(
        expect.objectContaining(dto),
      );
    });
  });

  describe('deleteAddress', () => {
    it('should soft delete address successfully', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const address = UserAddressFactory.create({
        id: 1,
        user,
        isDefault: false,
        isSearchAddress: false,
      });

      userAddressRepository.findOne.mockResolvedValue(address);
      userAddressRepository.softRemove.mockResolvedValue(address);

      // Act
      await service.deleteAddress(user, 1);

      // Assert
      expect(userAddressRepository.softRemove).toHaveBeenCalledWith(address);
    });

    it('should throw NotFoundException when address not found', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      userAddressRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteAddress(user, 999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reassign default flag when deleting default address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const defaultAddress = UserAddressFactory.create({
        id: 1,
        user,
        isDefault: true,
      });
      const otherAddress = UserAddressFactory.create({
        id: 2,
        user,
        isDefault: false,
      });

      userAddressRepository.findOne
        .mockResolvedValueOnce(defaultAddress)
        .mockResolvedValueOnce(otherAddress);
      userAddressRepository.save.mockResolvedValue(otherAddress);
      userAddressRepository.softRemove.mockResolvedValue(defaultAddress);

      // Act
      await service.deleteAddress(user, 1);

      // Assert
      expect(userAddressRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isDefault: true }),
      );
    });

    it('should reassign search address flag when deleting search address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const searchAddress = UserAddressFactory.create({
        id: 1,
        user,
        isSearchAddress: true,
      });
      const otherAddress = UserAddressFactory.create({
        id: 2,
        user,
        isSearchAddress: false,
      });

      userAddressRepository.findOne
        .mockResolvedValueOnce(searchAddress)
        .mockResolvedValueOnce(otherAddress);
      userAddressRepository.save.mockResolvedValue(otherAddress);
      userAddressRepository.softRemove.mockResolvedValue(searchAddress);

      // Act
      await service.deleteAddress(user, 1);

      // Assert
      expect(userAddressRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isSearchAddress: true }),
      );
    });
  });

  describe('deleteAddresses', () => {
    it('should delete multiple addresses successfully', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const addresses = [
        UserAddressFactory.create({ id: 1, user, isDefault: false }),
        UserAddressFactory.create({ id: 2, user, isDefault: false }),
      ];

      userAddressRepository.find.mockResolvedValue(addresses);
      userAddressRepository.softRemove.mockResolvedValue({} as UserAddress);

      // Act
      await service.deleteAddresses(user, [1, 2]);

      // Assert
      expect(userAddressRepository.softRemove).toHaveBeenCalledTimes(2);
    });

    it('should throw error when no address IDs provided', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });

      // Act & Assert
      await expect(service.deleteAddresses(user, [])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error when trying to delete default address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const addresses = [
        UserAddressFactory.create({ id: 1, user, isDefault: true }),
      ];

      userAddressRepository.find.mockResolvedValue(addresses);

      // Act & Assert
      await expect(service.deleteAddresses(user, [1])).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deleteAddresses(user, [1])).rejects.toThrow(
        '기본 주소는 삭제할 수 없습니다',
      );
    });

    it('should throw error when some addresses not found', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const addresses = [UserAddressFactory.create({ id: 1, user })];

      userAddressRepository.find.mockResolvedValue(addresses);

      // Act & Assert
      await expect(service.deleteAddresses(user, [1, 2, 3])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reassign search address when deleting search addresses', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const addresses = [
        UserAddressFactory.create({
          id: 1,
          user,
          isDefault: false,
          isSearchAddress: true,
        }),
      ];
      const remainingAddress = UserAddressFactory.create({
        id: 2,
        user,
        isSearchAddress: false,
      });

      userAddressRepository.find.mockResolvedValue(addresses);
      userAddressRepository.softRemove.mockResolvedValue({} as UserAddress);
      userAddressRepository.findOne.mockResolvedValue(remainingAddress);
      userAddressRepository.save.mockResolvedValue(remainingAddress);

      // Act
      await service.deleteAddresses(user, [1]);

      // Assert
      expect(userAddressRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isSearchAddress: true }),
      );
    });
  });

  describe('setDefaultAddress', () => {
    it('should set address as default', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const address = UserAddressFactory.create({
        id: 1,
        user,
        isDefault: false,
      });

      userAddressRepository.findOne.mockResolvedValue(address);
      userAddressRepository.update.mockResolvedValue(createMockUpdateResult(1));
      userAddressRepository.save.mockResolvedValue({
        ...address,
        isDefault: true,
      });

      // Act
      const result = await service.setDefaultAddress(user, 1);

      // Assert
      expect(result.isDefault).toBe(true);
      expect(userAddressRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ isDefault: true }),
        { isDefault: false },
      );
    });

    it('should throw NotFoundException when address not found', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      userAddressRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.setDefaultAddress(user, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setSearchAddress', () => {
    it('should set address as search address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const address = UserAddressFactory.create({
        id: 1,
        user,
        isSearchAddress: false,
      });

      userAddressRepository.findOne.mockResolvedValue(address);
      userAddressRepository.update.mockResolvedValue(createMockUpdateResult(1));
      userAddressRepository.save.mockResolvedValue({
        ...address,
        isSearchAddress: true,
      });

      // Act
      const result = await service.setSearchAddress(user, 1);

      // Assert
      expect(result.isSearchAddress).toBe(true);
    });
  });

  describe('getDefaultAddress', () => {
    it('should return default address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const address = UserAddressFactory.createDefault(user);

      userAddressRepository.findOne.mockResolvedValue(address);

      // Act
      const result = await service.getDefaultAddress(user);

      // Assert
      expect(result).toEqual(address);
      expect(result?.isDefault).toBe(true);
    });

    it('should return null if no default address exists', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      userAddressRepository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getDefaultAddress(user);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getSearchAddress', () => {
    it('should return search address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const address = UserAddressFactory.createSearchAddress(user);

      userAddressRepository.findOne.mockResolvedValue(address);

      // Act
      const result = await service.getSearchAddress(user);

      // Assert
      expect(result).toEqual(address);
      expect(result?.isSearchAddress).toBe(true);
    });
  });

  describe('updateSingleAddress', () => {
    it('should create new address when user has no addresses', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const selectedAddress = {
        address: '서울',
        roadAddress: '서울 강남구',
        postalCode: '06234',
        latitude: '37.5012345',
        longitude: '127.0398765',
      };

      userAddressRepository.count.mockResolvedValue(0);
      const newAddress = UserAddressFactory.create({
        roadAddress: selectedAddress.roadAddress,
        isDefault: true,
        isSearchAddress: true,
      });
      userAddressRepository.create.mockReturnValue(newAddress);
      userAddressRepository.save.mockResolvedValue(newAddress);

      // Act
      const result = await service.updateSingleAddress(user, selectedAddress);

      // Assert
      expect(result.isDefault).toBe(true);
      expect(result.isSearchAddress).toBe(true);
    });

    it('should update existing search address', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const selectedAddress = {
        address: '서울',
        roadAddress: '서울 강남구',
        postalCode: '06234',
        latitude: '37.5012345',
        longitude: '127.0398765',
      };
      const existingSearchAddress =
        UserAddressFactory.createSearchAddress(user);

      userAddressRepository.count.mockResolvedValue(1);
      userAddressRepository.findOne.mockResolvedValue(existingSearchAddress);
      userAddressRepository.save.mockResolvedValue({
        ...existingSearchAddress,
        roadAddress: selectedAddress.roadAddress,
      });

      // Act
      await service.updateSingleAddress(user, selectedAddress);

      // Assert
      expect(userAddressRepository.save).toHaveBeenCalled();
    });

    it('should throw error when latitude or longitude is missing', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const selectedAddress = {
        address: '서울',
        roadAddress: '서울 강남구',
        postalCode: '06234',
        latitude: '',
        longitude: '',
      };

      // Act & Assert
      await expect(
        service.updateSingleAddress(user, selectedAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update first address when no search address exists', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const selectedAddress = {
        address: '서울',
        roadAddress: '서울 강남구',
        postalCode: '06234',
        latitude: '37.5012345',
        longitude: '127.0398765',
      };
      const firstAddress = UserAddressFactory.create({ id: 1, user });

      userAddressRepository.count.mockResolvedValue(1);
      userAddressRepository.findOne
        .mockResolvedValueOnce(null) // getSearchAddress returns null
        .mockResolvedValueOnce(firstAddress); // findOne for first address
      userAddressRepository.save.mockResolvedValue({
        ...firstAddress,
        roadAddress: selectedAddress.roadAddress,
        isSearchAddress: true,
      });

      // Act
      const result = await service.updateSingleAddress(user, selectedAddress);

      // Assert
      expect(result.isSearchAddress).toBe(true);
    });

    it('should throw error when update fails', async () => {
      // Arrange
      const user = UserFactory.create({ id: 1 });
      const selectedAddress = {
        address: '서울',
        roadAddress: '서울 강남구',
        postalCode: '06234',
        latitude: '37.5012345',
        longitude: '127.0398765',
      };

      userAddressRepository.count.mockResolvedValue(1);
      userAddressRepository.findOne
        .mockResolvedValueOnce(null) // getSearchAddress
        .mockResolvedValueOnce(null); // findOne for first address

      // Act & Assert
      await expect(
        service.updateSingleAddress(user, selectedAddress),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
