import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AuthenticatedEntity,
  isSocialLogin,
  isUser,
} from '../common/interfaces/authenticated-user.interface';
import { CreateUserAddressDto } from './dto/create-user-address.dto';
import { SearchAddressDto } from './dto/search-address.dto';
import { UpdateUserAddressDto } from './dto/update-user-address.dto';
import { SocialLogin } from './entities/social-login.entity';
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
    @InjectRepository(SocialLogin)
    private readonly socialLoginRepository: Repository<SocialLogin>,
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
  }): Promise<User> {
    const user = this.userRepository.create({
      email: userData.email,
      password: userData.password,
      role: userData.role,
      name: userData.name ?? undefined,
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
      this.logger.warn(`User with email ${email} not found while marking email verified`);
      return;
    }
    if (user.emailVerified) {
      return;
    }
    user.emailVerified = true;
    await this.userRepository.save(user);
  }

  async findSocialLoginByEmail(email: string): Promise<SocialLogin | null> {
    return this.socialLoginRepository.findOne({ where: { email } });
  }

  async getOrFailByEmail(email: string): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }
    return user;
  }

  async getOrFailSocialLoginByEmail(email: string): Promise<SocialLogin> {
    const socialLogin = await this.findSocialLoginByEmail(email);
    if (!socialLogin) {
      throw new NotFoundException(`SocialLogin with email ${email} not found`);
    }
    return socialLogin;
  }

  async findUserOrSocialLoginByEmail(email: string): Promise<{
    type: 'user' | 'social';
    user?: User;
    socialLogin?: SocialLogin;
  }> {
    const user = await this.findByEmail(email);
    if (user) {
      return { type: 'user', user };
    }
    const socialLogin = await this.findSocialLoginByEmail(email);
    if (socialLogin) {
      return { type: 'social', socialLogin };
    }
    throw new NotFoundException(`User or SocialLogin with email ${email} not found`);
  }

  /**
   * 인증된 엔티티 조회 (통합 메서드용)
   */
  async getAuthenticatedEntity(email: string): Promise<User | SocialLogin> {
    const user = await this.findByEmail(email);
    if (user) return user;

    const socialLogin = await this.findSocialLoginByEmail(email);
    if (socialLogin) return socialLogin;

    throw new NotFoundException(`User or SocialLogin with email ${email} not found`);
  }

  async getUserBySocialId(socialId: string | number): Promise<SocialLogin | null> {
    return this.socialLoginRepository.findOne({
      where: { socialId: socialId.toString() },
      withDeleted: true,
    });
  }

  async createOauth(
    socialId: string | number,
    email: string,
    socialType: SocialType,
    profileImage?: string,
    name?: string,
  ): Promise<SocialLogin> {
    const socialLogin = this.socialLoginRepository.create({
      email,
      socialId: socialId.toString(),
      socialType,
      role: 'USER',
      profileImage,
      name,
    });
    return this.socialLoginRepository.save(socialLogin);
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }


  async deleteUser(email: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { email },
        withDeleted: true,
      });

      const socialLogin = await manager.findOne(SocialLogin, {
        where: { email },
        withDeleted: true,
      });

      if (!user && !socialLogin) {
        throw new NotFoundException('사용자를 찾을 수 없습니다.');
      }

      if ((user && user.deletedAt) || (socialLogin && socialLogin.deletedAt)) {
        throw new BadRequestException('이미 탈퇴한 계정입니다.');
      }

      if (user) {
        user.refreshToken = null;
        user.reRegisterEmailVerified = false;
        await manager.save(user);
        await manager.softRemove(user);
      }

      if (socialLogin) {
        socialLogin.refreshToken = null;
        await manager.save(socialLogin);
        await manager.softRemove(socialLogin);
      }
    });
  }

  // ========== Preference 관련 (통합 메서드) ==========

  async getEntityPreferences(entity: User | SocialLogin): Promise<UserPreferences> {
    return this.userPreferenceService.getPreferences(entity);
  }

  async updateEntityPreferences(
    entity: User | SocialLogin,
    likes?: string[],
    dislikes?: string[],
  ): Promise<UserPreferences> {
    return this.userPreferenceService.updatePreferences(entity, likes, dislikes);
  }

  async updateEntityPreferencesAnalysis(
    entity: User | SocialLogin,
    analysis: string,
  ): Promise<UserPreferences> {
    return this.userPreferenceService.updatePreferencesAnalysis(entity, analysis);
  }

  // ========== Address Search (위임) ==========

  async searchAddress(searchDto: SearchAddressDto): Promise<AddressSearchResponse> {
    return this.addressSearchService.searchAddress(searchDto);
  }

  // ========== Single Address Update (위임) ==========

  async updateEntitySingleAddress(
    entity: AuthenticatedEntity,
    selectedAddress: AddressSearchResult,
  ): Promise<AuthenticatedEntity> {
    return this.userAddressService.updateSingleAddress(entity, selectedAddress);
  }

  // ========== Address List (통합 메서드) ==========

  async getEntityAddresses(entity: User | SocialLogin): Promise<UserAddress[]> {
    return this.userAddressService.getAddresses(entity);
  }

  async createEntityAddress(entity: User | SocialLogin, dto: CreateUserAddressDto): Promise<UserAddress> {
    return this.userAddressService.createAddress(entity, dto);
  }

  async updateEntityAddress(
    entity: User | SocialLogin,
    addressId: number,
    dto: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    return this.userAddressService.updateAddress(entity, addressId, dto);
  }

  async deleteEntityAddresses(entity: User | SocialLogin, addressIds: number[]): Promise<void> {
    return this.userAddressService.deleteAddresses(entity, addressIds);
  }

  async setEntityDefaultAddress(entity: User | SocialLogin, addressId: number): Promise<UserAddress> {
    return this.userAddressService.setDefaultAddress(entity, addressId);
  }

  async setEntitySearchAddress(entity: User | SocialLogin, addressId: number): Promise<UserAddress> {
    return this.userAddressService.setSearchAddress(entity, addressId);
  }

  async getEntityDefaultAddress(entity: User | SocialLogin): Promise<UserAddress | null> {
    return this.userAddressService.getDefaultAddress(entity);
  }

  // ========== User Name Update (통합 메서드) ==========

  async updateEntityName(
    entity: User | SocialLogin,
    name: string,
  ): Promise<User | SocialLogin> {
    entity.name = name;
    if (isUser(entity)) {
      return this.userRepository.save(entity);
    } else if (isSocialLogin(entity)) {
      return this.socialLoginRepository.save(entity);
    }
    throw new NotFoundException('Entity type not recognized');
  }
}
