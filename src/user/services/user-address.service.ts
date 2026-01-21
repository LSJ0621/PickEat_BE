import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { USER_LIMITS } from '../../common/constants/business.constants';
import { CreateUserAddressDto } from '../dto/create-user-address.dto';
import { UpdateUserAddressDto } from '../dto/update-user-address.dto';
import { UserAddress } from '../entities/user-address.entity';
import { User } from '../entities/user.entity';
import { AddressSearchResult } from '../interfaces/address-search-result.interface';

@Injectable()
export class UserAddressService {
  private readonly logger = new Logger(UserAddressService.name);

  constructor(
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
  ) {}

  async getAddresses(entity: User): Promise<UserAddress[]> {
    return this.userAddressRepository.find({
      where: { user: { id: entity.id }, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async createAddress(
    entity: User,
    dto: CreateUserAddressDto,
  ): Promise<UserAddress> {
    const whereCondition = { user: { id: entity.id }, deletedAt: IsNull() };

    const activeCount = await this.userAddressRepository.count({
      where: whereCondition,
    });

    if (activeCount >= USER_LIMITS.MAX_ADDRESSES) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADDRESS_MAX_LIMIT,
      });
    }

    const { selectedAddress, alias, isDefault, isSearchAddress } = dto;
    const shouldSetDefault = activeCount === 0 || isDefault === true;
    const shouldSetSearchAddress =
      activeCount === 0 || isSearchAddress === true;

    if (shouldSetDefault) {
      await this.userAddressRepository.update(
        { ...whereCondition, isDefault: true },
        { isDefault: false },
      );
    }

    if (shouldSetSearchAddress) {
      await this.userAddressRepository.update(
        { ...whereCondition, isSearchAddress: true },
        { isSearchAddress: false },
      );
    }

    const address = this.userAddressRepository.create({
      user: entity,
      roadAddress: selectedAddress.roadAddress || selectedAddress.address,
      postalCode: selectedAddress.postalCode,
      latitude: parseFloat(selectedAddress.latitude),
      longitude: parseFloat(selectedAddress.longitude),
      alias: alias || null,
      isDefault: shouldSetDefault,
      isSearchAddress: shouldSetSearchAddress,
    });

    return this.userAddressRepository.save(address);
  }

  async updateAddress(
    entity: User,
    addressId: number,
    dto: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, user: { id: entity.id }, deletedAt: IsNull() },
    });

    if (!address) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADDRESS_NOT_FOUND,
      });
    }

    const whereCondition = { user: { id: entity.id }, deletedAt: IsNull() };

    if (dto.isDefault === true && !address.isDefault) {
      await this.userAddressRepository.update(
        { ...whereCondition, isDefault: true },
        { isDefault: false },
      );
    }

    if (dto.isSearchAddress === true && !address.isSearchAddress) {
      await this.userAddressRepository.update(
        { ...whereCondition, isSearchAddress: true },
        { isSearchAddress: false },
      );
    }

    if (dto.roadAddress !== undefined) address.roadAddress = dto.roadAddress;
    if (dto.latitude !== undefined) address.latitude = dto.latitude;
    if (dto.longitude !== undefined) address.longitude = dto.longitude;
    if (dto.alias !== undefined) address.alias = dto.alias;
    if (dto.isDefault !== undefined) address.isDefault = dto.isDefault;
    if (dto.isSearchAddress !== undefined)
      address.isSearchAddress = dto.isSearchAddress;

    return this.userAddressRepository.save(address);
  }

  async deleteAddress(entity: User, addressId: number): Promise<void> {
    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, user: { id: entity.id }, deletedAt: IsNull() },
    });

    if (!address) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADDRESS_NOT_FOUND,
      });
    }

    const whereCondition = {
      user: { id: entity.id },
      id: Not(addressId),
      deletedAt: IsNull(),
    };

    if (address.isDefault) {
      const otherAddress = await this.userAddressRepository.findOne({
        where: whereCondition,
      });
      if (otherAddress) {
        otherAddress.isDefault = true;
        await this.userAddressRepository.save(otherAddress);
      }
    }

    if (address.isSearchAddress) {
      const otherAddress = await this.userAddressRepository.findOne({
        where: whereCondition,
      });
      if (otherAddress) {
        otherAddress.isSearchAddress = true;
        await this.userAddressRepository.save(otherAddress);
      }
    }

    await this.userAddressRepository.softRemove(address);
  }

  async deleteAddresses(entity: User, addressIds: number[]): Promise<void> {
    if (!addressIds || addressIds.length === 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADDRESS_NO_ID_TO_DELETE,
      });
    }

    const addresses = await this.userAddressRepository.find({
      where: {
        id: In(addressIds),
        user: { id: entity.id },
        deletedAt: IsNull(),
      },
    });

    const foundIds = addresses.map((addr) => addr.id);
    const notFoundIds = addressIds.filter((id) => !foundIds.includes(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADDRESS_NOT_FOUND,
      });
    }

    const defaultAddresses = addresses.filter((addr) => addr.isDefault);
    if (defaultAddresses.length > 0) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADDRESS_CANNOT_DELETE_DEFAULT,
      });
    }

    const deletedSearchAddresses = addresses.filter(
      (addr) => addr.isSearchAddress,
    );

    for (const address of addresses) {
      await this.userAddressRepository.softRemove(address);
    }

    if (deletedSearchAddresses.length > 0) {
      const remainingAddress = await this.userAddressRepository.findOne({
        where: {
          user: { id: entity.id },
          id: Not(In(addressIds)),
          deletedAt: IsNull(),
        },
      });
      if (remainingAddress) {
        remainingAddress.isSearchAddress = true;
        await this.userAddressRepository.save(remainingAddress);
      }
    }
  }

  async setDefaultAddress(
    entity: User,
    addressId: number,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, user: { id: entity.id }, deletedAt: IsNull() },
    });

    if (!address) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADDRESS_NOT_FOUND,
      });
    }

    await this.userAddressRepository.update(
      { user: { id: entity.id }, isDefault: true, deletedAt: IsNull() },
      { isDefault: false },
    );

    address.isDefault = true;
    return this.userAddressRepository.save(address);
  }

  async setSearchAddress(
    entity: User,
    addressId: number,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, user: { id: entity.id }, deletedAt: IsNull() },
    });

    if (!address) {
      throw new NotFoundException({
        errorCode: ErrorCode.ADDRESS_NOT_FOUND,
      });
    }

    await this.userAddressRepository.update(
      { user: { id: entity.id }, isSearchAddress: true, deletedAt: IsNull() },
      { isSearchAddress: false },
    );

    address.isSearchAddress = true;
    return this.userAddressRepository.save(address);
  }

  async getDefaultAddress(entity: User): Promise<UserAddress | null> {
    return this.userAddressRepository.findOne({
      where: { user: { id: entity.id }, isDefault: true, deletedAt: IsNull() },
    });
  }

  async getSearchAddress(entity: User): Promise<UserAddress | null> {
    return this.userAddressRepository.findOne({
      where: {
        user: { id: entity.id },
        isSearchAddress: true,
        deletedAt: IsNull(),
      },
    });
  }

  async updateSingleAddress(
    entity: User,
    selectedAddress: AddressSearchResult,
  ): Promise<UserAddress> {
    const address = selectedAddress.roadAddress || selectedAddress.address;
    const latitude =
      selectedAddress.latitude && selectedAddress.latitude !== ''
        ? parseFloat(selectedAddress.latitude)
        : null;
    const longitude =
      selectedAddress.longitude && selectedAddress.longitude !== ''
        ? parseFloat(selectedAddress.longitude)
        : null;

    if (!latitude || !longitude) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADDRESS_LAT_LNG_REQUIRED,
      });
    }

    const existingAddresses = await this.userAddressRepository.count({
      where: { user: { id: entity.id }, deletedAt: IsNull() },
    });

    if (existingAddresses === 0) {
      const newAddress = this.userAddressRepository.create({
        user: entity,
        roadAddress: address,
        postalCode: selectedAddress.postalCode,
        latitude,
        longitude,
        isDefault: true,
        isSearchAddress: true,
        alias: null,
      });
      return this.userAddressRepository.save(newAddress);
    }

    const searchAddress = await this.getSearchAddress(entity);
    if (searchAddress) {
      searchAddress.roadAddress = address;
      searchAddress.postalCode = selectedAddress.postalCode || null;
      searchAddress.latitude = latitude;
      searchAddress.longitude = longitude;
      return this.userAddressRepository.save(searchAddress);
    }

    const firstAddress = await this.userAddressRepository.findOne({
      where: { user: { id: entity.id }, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    if (firstAddress) {
      firstAddress.roadAddress = address;
      firstAddress.postalCode = selectedAddress.postalCode || null;
      firstAddress.latitude = latitude;
      firstAddress.longitude = longitude;
      firstAddress.isSearchAddress = true;
      return this.userAddressRepository.save(firstAddress);
    }

    throw new BadRequestException({
      errorCode: ErrorCode.ADDRESS_UPDATE_FAILED,
    });
  }
}
