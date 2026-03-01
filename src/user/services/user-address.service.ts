import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { RedisCacheService } from '@/common/cache/cache.service';
import { CachedUserAddresses } from '@/common/cache/cache.interface';
import { USER_LIMITS } from '@/common/constants/business.constants';
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
    private readonly cacheService: RedisCacheService,
    private readonly dataSource: DataSource,
  ) {}

  async getAddresses(entity: User): Promise<UserAddress[]> {
    // 1. 캐시 조회
    const cached = await this.cacheService.getUserAddresses(entity.id);
    if (cached) {
      this.logger.debug(`[주소 캐시 HIT] userId=${entity.id}`);
      // Transform cached data to UserAddress-like objects
      // Note: These are plain objects, not TypeORM entities
      return cached.addresses.map((addr) => {
        const address = new UserAddress();
        address.id = addr.id;
        address.roadAddress = addr.roadAddress;
        address.postalCode = addr.postalCode;
        address.latitude = addr.latitude;
        address.longitude = addr.longitude;
        address.isDefault = addr.isDefault;
        address.isSearchAddress = addr.isSearchAddress;
        address.alias = addr.alias;
        address.createdAt = new Date(addr.createdAt);
        address.updatedAt = new Date(addr.updatedAt);
        return address;
      });
    }

    this.logger.debug(`[주소 캐시 MISS] userId=${entity.id}`);

    // 2. DB 조회
    const addresses = await this.userAddressRepository.find({
      where: { user: { id: entity.id }, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    // 3. 캐시 저장 (비동기, 에러 무시)
    this.cacheService
      .setUserAddresses(entity.id, this.serializeAddresses(addresses))
      .catch((err) => this.logger.warn(`주소 캐시 저장 실패: ${err.message}`));

    return addresses;
  }

  /**
   * UserAddress 엔티티를 캐시 가능한 형태로 직렬화
   */
  private serializeAddresses(
    addresses: UserAddress[],
  ): CachedUserAddresses['addresses'] {
    return addresses.map((addr) => ({
      id: addr.id,
      roadAddress: addr.roadAddress,
      postalCode: addr.postalCode,
      latitude: addr.latitude,
      longitude: addr.longitude,
      isDefault: addr.isDefault,
      isSearchAddress: addr.isSearchAddress,
      alias: addr.alias,
      createdAt: addr.createdAt.toISOString(),
      updatedAt: addr.updatedAt.toISOString(),
    }));
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

    const latitude =
      selectedAddress.latitude && selectedAddress.latitude !== ''
        ? parseFloat(selectedAddress.latitude)
        : null;
    const longitude =
      selectedAddress.longitude && selectedAddress.longitude !== ''
        ? parseFloat(selectedAddress.longitude)
        : null;

    if (
      latitude === null ||
      longitude === null ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADDRESS_LAT_LNG_REQUIRED,
      });
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      if (shouldSetDefault) {
        await manager.update(
          UserAddress,
          { ...whereCondition, isDefault: true },
          { isDefault: false },
        );
      }

      if (shouldSetSearchAddress) {
        await manager.update(
          UserAddress,
          { ...whereCondition, isSearchAddress: true },
          { isSearchAddress: false },
        );
      }

      const address = manager.create(UserAddress, {
        user: entity,
        roadAddress: selectedAddress.roadAddress || selectedAddress.address,
        postalCode: selectedAddress.postalCode,
        latitude,
        longitude,
        alias: alias || null,
        isDefault: shouldSetDefault,
        isSearchAddress: shouldSetSearchAddress,
      });

      return manager.save(address);
    });

    // 캐시 무효화 (주소 + 프로필)
    this.cacheService.invalidateUserAddresses(entity.id).catch((err) => {
      this.logger.warn(`주소 캐시 무효화 실패: ${err.message}`);
    });
    this.cacheService.invalidateUserProfile(entity.id).catch((err) => {
      this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
    });

    return saved;
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

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.isDefault === true && !address.isDefault) {
        await manager.update(
          UserAddress,
          { ...whereCondition, isDefault: true },
          { isDefault: false },
        );
      }

      if (dto.isSearchAddress === true && !address.isSearchAddress) {
        await manager.update(
          UserAddress,
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

      return manager.save(address);
    });

    // 캐시 무효화 (주소 + 프로필)
    this.cacheService.invalidateUserAddresses(entity.id).catch((err) => {
      this.logger.warn(`주소 캐시 무효화 실패: ${err.message}`);
    });
    this.cacheService.invalidateUserProfile(entity.id).catch((err) => {
      this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
    });

    return saved;
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

    await this.dataSource.transaction(async (manager) => {
      if (address.isDefault || address.isSearchAddress) {
        const otherAddress = await manager.findOne(UserAddress, {
          where: whereCondition,
        });
        if (otherAddress) {
          if (address.isDefault) {
            otherAddress.isDefault = true;
          }
          if (address.isSearchAddress) {
            otherAddress.isSearchAddress = true;
          }
          await manager.save(otherAddress);
        }
      }

      await manager.softRemove(address);
    });

    // 캐시 무효화 (주소 + 프로필)
    this.cacheService.invalidateUserAddresses(entity.id).catch((err) => {
      this.logger.warn(`주소 캐시 무효화 실패: ${err.message}`);
    });
    this.cacheService.invalidateUserProfile(entity.id).catch((err) => {
      this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
    });
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

    await this.dataSource.transaction(async (manager) => {
      for (const address of addresses) {
        await manager.softRemove(address);
      }

      if (deletedSearchAddresses.length > 0) {
        const remainingAddress = await manager.findOne(UserAddress, {
          where: {
            user: { id: entity.id },
            id: Not(In(addressIds)),
            deletedAt: IsNull(),
          },
        });
        if (remainingAddress) {
          remainingAddress.isSearchAddress = true;
          await manager.save(remainingAddress);
        }
      }
    });

    // 캐시 무효화 (주소 + 프로필)
    this.cacheService.invalidateUserAddresses(entity.id).catch((err) => {
      this.logger.warn(`주소 캐시 무효화 실패: ${err.message}`);
    });
    this.cacheService.invalidateUserProfile(entity.id).catch((err) => {
      this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
    });
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

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.update(
        UserAddress,
        { user: { id: entity.id }, isDefault: true, deletedAt: IsNull() },
        { isDefault: false },
      );

      address.isDefault = true;
      return manager.save(address);
    });

    // 캐시 무효화 (주소 + 프로필)
    this.cacheService.invalidateUserAddresses(entity.id).catch((err) => {
      this.logger.warn(`주소 캐시 무효화 실패: ${err.message}`);
    });
    this.cacheService.invalidateUserProfile(entity.id).catch((err) => {
      this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
    });

    return saved;
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

    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.update(
        UserAddress,
        { user: { id: entity.id }, isSearchAddress: true, deletedAt: IsNull() },
        { isSearchAddress: false },
      );

      address.isSearchAddress = true;
      return manager.save(address);
    });

    // 캐시 무효화 (주소 + 프로필)
    this.cacheService.invalidateUserAddresses(entity.id).catch((err) => {
      this.logger.warn(`주소 캐시 무효화 실패: ${err.message}`);
    });
    this.cacheService.invalidateUserProfile(entity.id).catch((err) => {
      this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
    });

    return saved;
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

    if (
      latitude === null ||
      longitude === null ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      throw new BadRequestException({
        errorCode: ErrorCode.ADDRESS_LAT_LNG_REQUIRED,
      });
    }

    const existingAddresses = await this.userAddressRepository.count({
      where: { user: { id: entity.id }, deletedAt: IsNull() },
    });

    let saved: UserAddress;

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
      saved = await this.userAddressRepository.save(newAddress);
    } else {
      const searchAddress = await this.getSearchAddress(entity);
      if (searchAddress) {
        searchAddress.roadAddress = address;
        searchAddress.postalCode = selectedAddress.postalCode || null;
        searchAddress.latitude = latitude;
        searchAddress.longitude = longitude;
        saved = await this.userAddressRepository.save(searchAddress);
      } else {
        const firstAddress = await this.userAddressRepository.findOne({
          where: { user: { id: entity.id }, deletedAt: IsNull() },
          order: { createdAt: 'ASC' },
        });

        if (!firstAddress) {
          throw new BadRequestException({
            errorCode: ErrorCode.ADDRESS_UPDATE_FAILED,
          });
        }

        firstAddress.roadAddress = address;
        firstAddress.postalCode = selectedAddress.postalCode || null;
        firstAddress.latitude = latitude;
        firstAddress.longitude = longitude;
        firstAddress.isSearchAddress = true;
        saved = await this.userAddressRepository.save(firstAddress);
      }
    }

    // 캐시 무효화 (주소 + 프로필)
    this.cacheService.invalidateUserAddresses(entity.id).catch((err) => {
      this.logger.warn(`주소 캐시 무효화 실패: ${err.message}`);
    });
    this.cacheService.invalidateUserProfile(entity.id).catch((err) => {
      this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
    });

    return saved;
  }
}
