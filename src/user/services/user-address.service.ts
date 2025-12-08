import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { USER_LIMITS } from '../../common/constants/business.constants';
import {
  AuthenticatedEntity,
  isSocialLogin,
  isUser,
} from '../../common/interfaces/authenticated-user.interface';
import { CreateUserAddressDto } from '../dto/create-user-address.dto';
import { UpdateUserAddressDto } from '../dto/update-user-address.dto';
import { SocialLogin } from '../entities/social-login.entity';
import { UserAddress } from '../entities/user-address.entity';
import { User } from '../entities/user.entity';
import { AddressSearchResult } from '../interfaces/address-search-result.interface';

@Injectable()
export class UserAddressService {
  private readonly logger = new Logger(UserAddressService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SocialLogin)
    private readonly socialLoginRepository: Repository<SocialLogin>,
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
  ) {}

  // ========== 통합 메서드 (AuthenticatedEntity 사용) ==========

  async getAddresses(entity: AuthenticatedEntity): Promise<UserAddress[]> {
    const whereCondition = isUser(entity)
      ? { user: { id: entity.id }, deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, deletedAt: IsNull() };

    return this.userAddressRepository.find({
      where: whereCondition,
      order: { createdAt: 'DESC' },
    });
  }

  async createAddress(
    entity: AuthenticatedEntity,
    dto: CreateUserAddressDto,
  ): Promise<UserAddress> {
    const whereCondition = isUser(entity)
      ? { user: { id: entity.id }, deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, deletedAt: IsNull() };

    const activeCount = await this.userAddressRepository.count({
      where: whereCondition,
    });

    if (activeCount >= USER_LIMITS.MAX_ADDRESSES) {
      throw new BadRequestException(
        `주소는 최대 ${USER_LIMITS.MAX_ADDRESSES}개까지만 저장할 수 있습니다.`,
      );
    }

    const { selectedAddress, alias, isDefault, isSearchAddress } = dto;
    const shouldSetDefault = activeCount === 0 || isDefault === true;
    const shouldSetSearchAddress = activeCount === 0 || isSearchAddress === true;

    // 기본 주소 설정 시 기존 기본 주소 해제
    if (shouldSetDefault) {
      await this.userAddressRepository.update(
        { ...whereCondition, isDefault: true },
        { isDefault: false },
      );
    }

    // 검색 주소 설정 시 기존 검색 주소 해제
    if (shouldSetSearchAddress) {
      await this.userAddressRepository.update(
        { ...whereCondition, isSearchAddress: true },
        { isSearchAddress: false },
      );
    }

    const addressData: Partial<UserAddress> = {
      roadAddress: selectedAddress.roadAddress || selectedAddress.address,
      postalCode: selectedAddress.postalCode,
      latitude: parseFloat(selectedAddress.latitude),
      longitude: parseFloat(selectedAddress.longitude),
      alias: alias || null,
      isDefault: shouldSetDefault,
      isSearchAddress: shouldSetSearchAddress,
    };

    if (isUser(entity)) {
      (addressData as any).user = entity;
    } else {
      (addressData as any).socialLogin = entity;
    }

    const address = this.userAddressRepository.create(addressData);
    return this.userAddressRepository.save(address);
  }

  async updateAddress(
    entity: AuthenticatedEntity,
    addressId: number,
    dto: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    const whereCondition = isUser(entity)
      ? { id: addressId, user: { id: entity.id }, deletedAt: IsNull() }
      : { id: addressId, socialLogin: { id: entity.id }, deletedAt: IsNull() };

    const address = await this.userAddressRepository.findOne({
      where: whereCondition,
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    const ownerWhereCondition = isUser(entity)
      ? { user: { id: entity.id }, deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, deletedAt: IsNull() };

    // 기본 주소 설정 시 기존 기본 주소 해제
    if (dto.isDefault === true && !address.isDefault) {
      await this.userAddressRepository.update(
        { ...ownerWhereCondition, isDefault: true },
        { isDefault: false },
      );
    }

    // 검색 주소 설정 시 기존 검색 주소 해제
    if (dto.isSearchAddress === true && !address.isSearchAddress) {
      await this.userAddressRepository.update(
        { ...ownerWhereCondition, isSearchAddress: true },
        { isSearchAddress: false },
      );
    }

    // 부분 업데이트
    if (dto.roadAddress !== undefined) address.roadAddress = dto.roadAddress;
    if (dto.latitude !== undefined) address.latitude = dto.latitude;
    if (dto.longitude !== undefined) address.longitude = dto.longitude;
    if (dto.alias !== undefined) address.alias = dto.alias;
    if (dto.isDefault !== undefined) address.isDefault = dto.isDefault;
    if (dto.isSearchAddress !== undefined) address.isSearchAddress = dto.isSearchAddress;

    return this.userAddressRepository.save(address);
  }

  async deleteAddress(entity: AuthenticatedEntity, addressId: number): Promise<void> {
    const whereCondition = isUser(entity)
      ? { id: addressId, user: { id: entity.id }, deletedAt: IsNull() }
      : { id: addressId, socialLogin: { id: entity.id }, deletedAt: IsNull() };

    const address = await this.userAddressRepository.findOne({
      where: whereCondition,
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    const ownerWhereCondition = isUser(entity)
      ? { user: { id: entity.id }, id: Not(addressId), deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, id: Not(addressId), deletedAt: IsNull() };

    // 기본 주소 삭제 시 다른 주소를 기본으로 설정
    if (address.isDefault) {
      const otherAddress = await this.userAddressRepository.findOne({
        where: ownerWhereCondition,
      });
      if (otherAddress) {
        otherAddress.isDefault = true;
        await this.userAddressRepository.save(otherAddress);
      }
    }

    // 검색 주소 삭제 시 다른 주소를 검색 주소로 설정
    if (address.isSearchAddress) {
      const otherAddress = await this.userAddressRepository.findOne({
        where: ownerWhereCondition,
      });
      if (otherAddress) {
        otherAddress.isSearchAddress = true;
        await this.userAddressRepository.save(otherAddress);
      }
    }

    await this.userAddressRepository.softRemove(address);
  }

  async deleteAddresses(entity: AuthenticatedEntity, addressIds: number[]): Promise<void> {
    if (!addressIds || addressIds.length === 0) {
      throw new BadRequestException('삭제할 주소 ID가 없습니다.');
    }

    const whereCondition = isUser(entity)
      ? { id: In(addressIds), user: { id: entity.id }, deletedAt: IsNull() }
      : { id: In(addressIds), socialLogin: { id: entity.id }, deletedAt: IsNull() };

    const addresses = await this.userAddressRepository.find({
      where: whereCondition,
    });

    const foundIds = addresses.map((addr) => addr.id);
    const notFoundIds = addressIds.filter((id) => !foundIds.includes(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException(`주소를 찾을 수 없습니다. ID: ${notFoundIds.join(', ')}`);
    }

    const defaultAddresses = addresses.filter((addr) => addr.isDefault);
    if (defaultAddresses.length > 0) {
      throw new BadRequestException(
        '기본 주소는 삭제할 수 없습니다. 기본 주소를 변경한 후 삭제해주세요.',
      );
    }

    const deletedSearchAddresses = addresses.filter((addr) => addr.isSearchAddress);

    for (const address of addresses) {
      await this.userAddressRepository.softRemove(address);
    }

    // 검색 주소가 삭제된 경우 다른 주소를 검색 주소로 설정
    if (deletedSearchAddresses.length > 0) {
      const remainingWhereCondition = isUser(entity)
        ? { user: { id: entity.id }, id: Not(In(addressIds)), deletedAt: IsNull() }
        : { socialLogin: { id: entity.id }, id: Not(In(addressIds)), deletedAt: IsNull() };

      const remainingAddress = await this.userAddressRepository.findOne({
        where: remainingWhereCondition,
      });
      if (remainingAddress) {
        remainingAddress.isSearchAddress = true;
        await this.userAddressRepository.save(remainingAddress);
      }
    }
  }

  async setDefaultAddress(entity: AuthenticatedEntity, addressId: number): Promise<UserAddress> {
    const whereCondition = isUser(entity)
      ? { id: addressId, user: { id: entity.id }, deletedAt: IsNull() }
      : { id: addressId, socialLogin: { id: entity.id }, deletedAt: IsNull() };

    const address = await this.userAddressRepository.findOne({
      where: whereCondition,
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    const ownerWhereCondition = isUser(entity)
      ? { user: { id: entity.id }, isDefault: true, deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, isDefault: true, deletedAt: IsNull() };

    await this.userAddressRepository.update(ownerWhereCondition, { isDefault: false });

    address.isDefault = true;
    return this.userAddressRepository.save(address);
  }

  async setSearchAddress(entity: AuthenticatedEntity, addressId: number): Promise<UserAddress> {
    const whereCondition = isUser(entity)
      ? { id: addressId, user: { id: entity.id }, deletedAt: IsNull() }
      : { id: addressId, socialLogin: { id: entity.id }, deletedAt: IsNull() };

    const address = await this.userAddressRepository.findOne({
      where: whereCondition,
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    const ownerWhereCondition = isUser(entity)
      ? { user: { id: entity.id }, isSearchAddress: true, deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, isSearchAddress: true, deletedAt: IsNull() };

    await this.userAddressRepository.update(ownerWhereCondition, { isSearchAddress: false });

    address.isSearchAddress = true;
    return this.userAddressRepository.save(address);
  }

  async getDefaultAddress(entity: AuthenticatedEntity): Promise<UserAddress | null> {
    const whereCondition = isUser(entity)
      ? { user: { id: entity.id }, isDefault: true, deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, isDefault: true, deletedAt: IsNull() };

    return this.userAddressRepository.findOne({ where: whereCondition });
  }

  async getSearchAddress(entity: AuthenticatedEntity): Promise<UserAddress | null> {
    const whereCondition = isUser(entity)
      ? { user: { id: entity.id }, isSearchAddress: true, deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, isSearchAddress: true, deletedAt: IsNull() };

    return this.userAddressRepository.findOne({ where: whereCondition });
  }

  async updateSingleAddress(
    entity: AuthenticatedEntity,
    selectedAddress: AddressSearchResult,
  ): Promise<AuthenticatedEntity> {
    const address = selectedAddress.roadAddress || selectedAddress.address;
    const latitude =
      selectedAddress.latitude && selectedAddress.latitude !== ''
        ? parseFloat(selectedAddress.latitude)
        : null;
    const longitude =
      selectedAddress.longitude && selectedAddress.longitude !== ''
        ? parseFloat(selectedAddress.longitude)
        : null;

    if (isUser(entity)) {
      entity.address = address;
      entity.latitude = latitude;
      entity.longitude = longitude;
      await this.userRepository.save(entity);
    } else if (isSocialLogin(entity)) {
      entity.address = address;
      entity.latitude = latitude;
      entity.longitude = longitude;
      await this.socialLoginRepository.save(entity);
    }

    // UserAddress 리스트가 비어있으면 자동으로 추가
    const whereCondition = isUser(entity)
      ? { user: { id: entity.id }, deletedAt: IsNull() }
      : { socialLogin: { id: entity.id }, deletedAt: IsNull() };

    const existingAddresses = await this.userAddressRepository.count({
      where: whereCondition,
    });

    if (existingAddresses === 0 && address && latitude && longitude) {
      const addressData: Partial<UserAddress> = {
        roadAddress: address,
        postalCode: selectedAddress.postalCode,
        latitude,
        longitude,
        isDefault: true,
        isSearchAddress: true,
        alias: null,
      };

      if (isUser(entity)) {
        (addressData as any).user = entity;
      } else {
        (addressData as any).socialLogin = entity;
      }

      const newAddress = this.userAddressRepository.create(addressData);
      await this.userAddressRepository.save(newAddress);
    }

    return entity;
  }

}

