import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  IsNull,
  Not,
  OptimisticLockVersionMismatchError,
  Repository,
} from 'typeorm';
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
import { RedisCacheService } from '@/common/cache/cache.service';
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
    private readonly cacheService: RedisCacheService,
  ) {}

  // ========== User CRUD ==========

  async createUser(userData: {
    email: string;
    password: string;
    role?: string;
    name?: string | null;
    preferredLanguage?: 'ko' | 'en';
    birthDate?: string;
    gender?: 'male' | 'female' | 'other';
  }): Promise<User> {
    const user = this.userRepository.create({
      email: userData.email,
      password: userData.password,
      role: userData.role,
      name: userData.name ?? undefined,
      preferredLanguage: userData.preferredLanguage ?? 'ko',
      birthDate: userData.birthDate ?? undefined,
      gender: userData.gender ?? undefined,
    });
    return this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findByEmailWithSelect(
    email: string,
    select: (keyof User)[],
  ): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      select,
    });
  }

  async findByIdWithSelect(
    id: number,
    select: (keyof User)[],
  ): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      select,
    });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email, password: Not(IsNull()) },
    });
  }

  async findBySocialEmailWithDeleted(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email, socialId: Not(IsNull()) },
      withDeleted: true,
    });
  }

  async updateLoginTimestamps(userId: number): Promise<void> {
    const now = new Date();
    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ lastLoginAt: now, lastActiveAt: now })
      .where('id = :id', { id: userId })
      .execute();
  }

  async updateLastActiveAt(userId: number): Promise<void> {
    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ lastActiveAt: new Date() })
      .where('id = :id', { id: userId })
      .execute();
  }

  async restoreSocialUser(email: string): Promise<void> {
    await this.userRepository.update(
      { email },
      { deletedAt: null },
    );
  }

  async updatePassword(user: User, hashedPassword: string): Promise<User> {
    user.password = hashedPassword;
    user.lastPasswordChangedAt = new Date();

    try {
      return await this.userRepository.save(user);
    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError) {
        throw new BadRequestException({
          errorCode: ErrorCode.USER_OPTIMISTIC_LOCK_FAILED,
        });
      }
      throw error;
    }
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
    preferredLanguage?: 'ko' | 'en',
  ): Promise<User> {
    const user = this.userRepository.create({
      email,
      socialId: socialId.toString(),
      socialType,
      role: 'USER',
      name,
      password: null,
      preferredLanguage: preferredLanguage ?? 'ko',
    });
    return this.userRepository.save(user);
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException({
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
          errorCode: ErrorCode.USER_NOT_FOUND,
        });
      }

      if (user.deletedAt) {
        throw new BadRequestException({
          errorCode: ErrorCode.USER_ALREADY_WITHDRAWN,
        });
      }

      user.reRegisterEmailVerified = false;
      await manager.save(user);
      await manager.softRemove(user);

      // 사용자 관련 캐시 전체 무효화
      Promise.allSettled([
        this.cacheService.invalidateUserProfile(user.id),
        this.cacheService.invalidateUserAddresses(user.id),
        this.cacheService.invalidateUserPreferences(user.id),
        this.cacheService.deleteRefreshToken(user.id),
      ]).catch((err) => {
        this.logger.warn(`사용자 캐시 무효화 실패: ${err}`);
      });
    });
  }

  // ========== Preference 관련 (통합 메서드) ==========

  async getEntityPreferences(entity: User): Promise<UserPreferences> {
    return this.userPreferenceService.getPreferences(entity);
  }

  async getEntityPreferencesByUserIds(
    userIds: number[],
  ): Promise<Map<number, UserPreferences>> {
    if (userIds.length === 0) return new Map();

    const users = await this.userRepository.findByIds(userIds);
    const result = new Map<number, UserPreferences>();

    await Promise.all(
      users.map(async (user) => {
        const prefs = await this.userPreferenceService.getPreferences(user);
        result.set(user.id, prefs);
      }),
    );

    return result;
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

  async updateEntityLanguage(
    email: string,
    language: 'ko' | 'en',
  ): Promise<void> {
    const result = await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ preferredLanguage: language })
      .where('email = :email', { email })
      .returning('id')
      .execute();

    const raw = result.raw as Array<{ id: number }>;
    if (!result.affected || result.affected === 0 || raw.length === 0) {
      throw new NotFoundException({
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
    }

    const userId = raw[0].id;
    this.cacheService.invalidateUserProfile(userId).catch((err: Error) => {
      this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
    });
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

    try {
      const saved = await this.userRepository.save(entity);

      // 프로필 캐시 무효화
      this.cacheService.invalidateUserProfile(entity.id).catch((err) => {
        this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
      });

      return saved;
    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError) {
        throw new BadRequestException({
          errorCode: ErrorCode.USER_OPTIMISTIC_LOCK_FAILED,
        });
      }
      throw error;
    }
  }

  // ========== User Profile Update (통합 메서드) ==========

  async updateProfile(
    userId: number,
    updates: {
      name?: string;
      birthDate?: string;
      gender?: 'male' | 'female' | 'other';
    },
  ): Promise<User> {
    const user = await this.findOne(userId);

    if (updates.name !== undefined) {
      user.name = updates.name;
    }
    if (updates.birthDate !== undefined) {
      user.birthDate = updates.birthDate;
    }
    if (updates.gender !== undefined) {
      user.gender = updates.gender;
    }

    try {
      const saved = await this.userRepository.save(user);

      // 프로필 캐시 무효화
      this.cacheService.invalidateUserProfile(userId).catch((err) => {
        this.logger.warn(`프로필 캐시 무효화 실패: ${err.message}`);
      });

      return saved;
    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError) {
        throw new BadRequestException({
          errorCode: ErrorCode.USER_OPTIMISTIC_LOCK_FAILED,
        });
      }
      throw error;
    }
  }
}
