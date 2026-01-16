import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ErrorCode } from '@/common/constants/error-codes';
import { CreateUserAddressDto } from './dto/create-user-address.dto';
import { SearchAddressDto } from './dto/search-address.dto';
import { UpdateUserAddressDto } from './dto/update-user-address.dto';
import { UserAddress } from './entities/user-address.entity';
import { User } from './entities/user.entity';
import { SocialType } from './enum/social-type.enum';
import {
  AddressSearchResponse,
  AddressSearchResult,
} from './interfaces/address-search-result.interface';
import { UserPreferences } from './interfaces/user-preferences.interface';
import { AddressSearchService } from './services/address-search.service';
import { UserAddressService } from './services/user-address.service';
import { UserPreferenceService } from './services/user-preference.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly addressSearchService: AddressSearchService,
    private readonly userAddressService: UserAddressService,
    private readonly userPreferenceService: UserPreferenceService,
  ) {}

  // ========== User CRUD ==========

  async createUser(userData: {
    email: string;
    password: string;
    role?: string;
    name?: string | null;
    preferredLanguage?: string;
  }): Promise<User> {
    const user = this.userRepository.create({
      email: userData.email,
      password: userData.password,
      role: userData.role,
      name: userData.name ?? undefined,
      preferredLanguage: userData.preferredLanguage ?? 'ko',
    });
    return this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async updatePassword(user: User, hashedPassword: string): Promise<User> {
    user.password = hashedPassword;
    user.lastPasswordChangedAt = new Date();
    return this.userRepository.save(user);
  }

  async markEmailVerified(email: string): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) {
      this.logger.warn(
        `User with email ${email} not found while marking email verified`,
      );
      return;
    }
    if (user.emailVerified) {
      return;
    }
    user.emailVerified = true;
    await this.userRepository.save(user);
  }

  async getOrFailByEmail(email: string): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException({
        message: `User with email ${email} not found`,
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
    }
    return user;
  }

  async getAuthenticatedEntity(email: string): Promise<User> {
    return this.getOrFailByEmail(email);
  }

  async getUserBySocialId(socialId: string | number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { socialId: socialId.toString() },
      withDeleted: true,
    });
  }

  async createOauth(
    socialId: string | number,
    email: string,
    socialType: SocialType,
    name?: string,
  ): Promise<User> {
    const user = this.userRepository.create({
      email,
      socialId: socialId.toString(),
      socialType,
      role: 'USER',
      name,
      password: null,
    });
    return this.userRepository.save(user);
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException({
        message: `User ${id} not found`,
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
    }
    return user;
  }

  async deleteUser(email: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { email },
        withDeleted: true,
      });

      if (!user) {
        throw new NotFoundException({
          message: '사용자를 찾을 수 없습니다.',
          errorCode: ErrorCode.USER_NOT_FOUND,
        });
      }

      if (user.deletedAt) {
        throw new BadRequestException({
          message: '이미 탈퇴한 계정입니다.',
          errorCode: ErrorCode.USER_NOT_FOUND,
        });
      }

      user.refreshToken = null;
      user.reRegisterEmailVerified = false;
      await manager.save(user);
      await manager.softRemove(user);
    });
  }

  // ========== Preference 관련 (통합 메서드) ==========

  async getEntityPreferences(entity: User): Promise<UserPreferences> {
    return this.userPreferenceService.getPreferences(entity);
  }

  async updateEntityPreferences(
    entity: User,
    likes?: string[],
    dislikes?: string[],
  ): Promise<UserPreferences> {
    return this.userPreferenceService.updatePreferences(
      entity,
      likes,
      dislikes,
    );
  }

  async updateEntityPreferencesAnalysis(
    entity: User,
    analysis: string,
  ): Promise<UserPreferences> {
    return this.userPreferenceService.updatePreferencesAnalysis(
      entity,
      analysis,
    );
  }

  // ========== Language 관련 ==========

  async updateEntityLanguage(entity: User, language: string): Promise<void> {
    entity.preferredLanguage = language;
    await this.userRepository.save(entity);
  }

  // ========== Address Search (위임) ==========

  async searchAddress(
    searchDto: SearchAddressDto,
  ): Promise<AddressSearchResponse> {
    return this.addressSearchService.searchAddress(searchDto);
  }

  // ========== Single Address Update (위임) ==========

  async updateEntitySingleAddress(
    entity: User,
    selectedAddress: AddressSearchResult,
  ): Promise<UserAddress> {
    return this.userAddressService.updateSingleAddress(entity, selectedAddress);
  }

  // ========== Address List (통합 메서드) ==========

  async getEntityAddresses(entity: User): Promise<UserAddress[]> {
    return this.userAddressService.getAddresses(entity);
  }

  async createEntityAddress(
    entity: User,
    dto: CreateUserAddressDto,
  ): Promise<UserAddress> {
    return this.userAddressService.createAddress(entity, dto);
  }

  async updateEntityAddress(
    entity: User,
    addressId: number,
    dto: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    return this.userAddressService.updateAddress(entity, addressId, dto);
  }

  async deleteEntityAddresses(
    entity: User,
    addressIds: number[],
  ): Promise<void> {
    return this.userAddressService.deleteAddresses(entity, addressIds);
  }

  async setEntityDefaultAddress(
    entity: User,
    addressId: number,
  ): Promise<UserAddress> {
    return this.userAddressService.setDefaultAddress(entity, addressId);
  }

  async setEntitySearchAddress(
    entity: User,
    addressId: number,
  ): Promise<UserAddress> {
    return this.userAddressService.setSearchAddress(entity, addressId);
  }

  async getEntityDefaultAddress(entity: User): Promise<UserAddress | null> {
    return this.userAddressService.getDefaultAddress(entity);
  }

  // ========== User Name Update (통합 메서드) ==========

  async updateEntityName(entity: User, name: string): Promise<User> {
    entity.name = name;
    return this.userRepository.save(entity);
  }
}
