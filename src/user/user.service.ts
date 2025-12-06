import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { CreateUserAddressDto } from './dto/create-user-address.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { SearchAddressDto } from './dto/search-address.dto';
import { UpdateUserAddressDto } from './dto/update-user-address.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SocialLogin } from './entities/social-login.entity';
import { UserAddress } from './entities/user-address.entity';
import { User } from './entities/user.entity';
import { SocialType } from './enum/social-type.enum';
import {
  AddressSearchResponse,
  AddressSearchResult,
} from './interfaces/address-search-result.interface';
import { KakaoLocalAddressResponse } from './interfaces/kakao-local.interface';
import {
  defaultUserPreferences,
  UserPreferences,
} from './interfaces/user-preferences.interface';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly kakaoApiClient: AxiosInstance;
  private readonly kakaoApiKey: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SocialLogin)
    private readonly socialLoginRepository: Repository<SocialLogin>,
    @InjectRepository(UserAddress)
    private readonly userAddressRepository: Repository<UserAddress>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.kakaoApiKey = this.config.get<string>('KAKAO_REST_API_KEY', '');
    if (!this.kakaoApiKey) {
      this.logger.warn(
        'KAKAO_REST_API_KEY가 설정되지 않았습니다. .env 파일에 추가해주세요.',
      );
    }

    this.kakaoApiClient = axios.create({
      baseURL: 'https://dapi.kakao.com',
      headers: {
        Authorization: `KakaoAK ${this.kakaoApiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async create(createUserDto: CreateUserDto) {
    const user = this.userRepository.create(createUserDto);
    return this.userRepository.save(user);
  }

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

  // User 또는 SocialLogin 중 하나를 찾는 메서드 (JWT 토큰에서 타입을 알 수 없을 때 사용)
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
    throw new NotFoundException(
      `User or SocialLogin with email ${email} not found`,
    );
  }

  async getUserBySocialId(
    socialId: string | number,
  ): Promise<SocialLogin | null> {
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

  async updateSocialLoginSingleAddress(
    socialLoginId: number,
    selectedAddress: AddressSearchResult,
  ): Promise<SocialLogin> {
    const socialLogin = await this.socialLoginRepository.findOne({
      where: { id: socialLoginId },
    });
    if (!socialLogin) {
      throw new NotFoundException('SocialLogin not found');
    }
    socialLogin.address =
      selectedAddress.roadAddress || selectedAddress.address;
    socialLogin.latitude =
      selectedAddress.latitude && selectedAddress.latitude !== ''
        ? parseFloat(selectedAddress.latitude)
        : null;
    socialLogin.longitude =
      selectedAddress.longitude && selectedAddress.longitude !== ''
        ? parseFloat(selectedAddress.longitude)
        : null;
    await this.socialLoginRepository.save(socialLogin);

    // UserAddress 리스트가 비어있으면 자동으로 추가하고 기본주소로 설정
    const existingAddresses = await this.userAddressRepository.count({
      where: { socialLogin: { id: socialLoginId }, deletedAt: IsNull() },
    });

    if (
      existingAddresses === 0 &&
      socialLogin.address &&
      socialLogin.latitude &&
      socialLogin.longitude
    ) {
      const address = this.userAddressRepository.create({
        socialLogin,
        roadAddress: socialLogin.address,
        postalCode: selectedAddress.postalCode,
        latitude: socialLogin.latitude,
        longitude: socialLogin.longitude,
        isDefault: true, // 기본주소로 자동 설정
        isSearchAddress: true, // 검색주소로도 자동 설정
        alias: null,
      });
      await this.userAddressRepository.save(address);
    }

    return socialLogin;
  }

  async updateSocialLoginName(
    socialLoginId: number,
    name: string,
  ): Promise<SocialLogin> {
    const socialLogin = await this.socialLoginRepository.findOne({
      where: { id: socialLoginId },
    });
    if (!socialLogin) {
      throw new NotFoundException('SocialLogin not found');
    }
    socialLogin.name = name;
    return this.socialLoginRepository.save(socialLogin);
  }

  findAll() {
    return this.userRepository.find();
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);

    // 보내준 필드만 업데이트 (undefined인 필드는 업데이트하지 않음)
    if (updateUserDto.name !== undefined) {
      user.name = updateUserDto.name;
    }

    return this.userRepository.save(user);
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
    return user;
  }

  async getPreferences(userId: number): Promise<UserPreferences> {
    const user = await this.findOne(userId);
    const preferences = user.preferences ?? defaultUserPreferences();
    // analysis 필드가 항상 포함되도록 보장
    return {
      likes: preferences.likes ?? [],
      dislikes: preferences.dislikes ?? [],
      analysis: preferences.analysis ?? undefined,
    };
  }

  async updatePreferences(
    userId: number,
    likes?: string[],
    dislikes?: string[],
  ): Promise<UserPreferences> {
    const user = await this.findOne(userId);
    const currentPreferences = user.preferences ?? defaultUserPreferences();

    // 좋아하는 것과 싫어하는 것을 각각 정규화
    const normalizedLikes =
      likes !== undefined
        ? this.normalizeTags(likes)
        : currentPreferences.likes;
    const normalizedDislikes =
      dislikes !== undefined
        ? this.normalizeTags(dislikes)
        : currentPreferences.dislikes;

    user.preferences = {
      likes: normalizedLikes,
      dislikes: normalizedDislikes,
      analysis: currentPreferences.analysis, // analysis는 유지 (스케줄러 전용)
    };
    await this.userRepository.save(user);
    return user.preferences;
  }

  async updatePreferencesAnalysis(
    userId: number,
    analysis: string,
  ): Promise<UserPreferences> {
    const user = await this.findOne(userId);
    const currentPreferences = user.preferences ?? defaultUserPreferences();

    user.preferences = {
      likes: currentPreferences.likes,
      dislikes: currentPreferences.dislikes,
      analysis: analysis.trim(),
    };
    await this.userRepository.save(user);
    return user.preferences;
  }

  async getSocialLoginPreferences(
    socialLoginId: number,
  ): Promise<UserPreferences> {
    const socialLogin = await this.socialLoginRepository.findOne({
      where: { id: socialLoginId },
    });
    if (!socialLogin) {
      throw new NotFoundException('SocialLogin not found');
    }
    const preferences = socialLogin.preferences ?? defaultUserPreferences();
    // analysis 필드가 항상 포함되도록 보장
    return {
      likes: preferences.likes ?? [],
      dislikes: preferences.dislikes ?? [],
      analysis: preferences.analysis ?? undefined,
    };
  }

  async updateSocialLoginPreferences(
    socialLoginId: number,
    likes?: string[],
    dislikes?: string[],
  ): Promise<UserPreferences> {
    const socialLogin = await this.socialLoginRepository.findOne({
      where: { id: socialLoginId },
    });
    if (!socialLogin) {
      throw new NotFoundException('SocialLogin not found');
    }
    const currentPreferences =
      socialLogin.preferences ?? defaultUserPreferences();

    // 좋아하는 것과 싫어하는 것을 각각 정규화
    const normalizedLikes =
      likes !== undefined
        ? this.normalizeTags(likes)
        : currentPreferences.likes;
    const normalizedDislikes =
      dislikes !== undefined
        ? this.normalizeTags(dislikes)
        : currentPreferences.dislikes;

    socialLogin.preferences = {
      likes: normalizedLikes,
      dislikes: normalizedDislikes,
      analysis: currentPreferences.analysis, // analysis는 유지 (스케줄러 전용)
    };
    await this.socialLoginRepository.save(socialLogin);
    return socialLogin.preferences;
  }

  async updateSocialLoginPreferencesAnalysis(
    socialLoginId: number,
    analysis: string,
  ): Promise<UserPreferences> {
    const socialLogin = await this.socialLoginRepository.findOne({
      where: { id: socialLoginId },
    });
    if (!socialLogin) {
      throw new NotFoundException('SocialLogin not found');
    }
    const currentPreferences =
      socialLogin.preferences ?? defaultUserPreferences();

    socialLogin.preferences = {
      likes: currentPreferences.likes,
      dislikes: currentPreferences.dislikes,
      analysis: analysis.trim(),
    };
    await this.socialLoginRepository.save(socialLogin);
    return socialLogin.preferences;
  }

  async searchAddress(
    searchDto: SearchAddressDto,
  ): Promise<AddressSearchResponse> {
    try {
      const response = await this.kakaoApiClient.get<KakaoLocalAddressResponse>(
        '/v2/local/search/address.json',
        {
          params: {
            query: searchDto.query,
            analyze_type: 'similar',
            page: 1,
            size: 10,
          },
        },
      );

      // 카카오 API 원본 데이터는 로깅용으로 그대로 보관
      this.logger.debug('카카오 API 원본 응답', JSON.stringify(response.data));

      // 필요한 데이터만 추출하여 반환
      const addresses: AddressSearchResult[] = response.data.documents.map(
        (doc) => {
          const address = doc.address?.address_name || ''; // 지번주소
          const roadAddress = doc.road_address?.address_name || null; // 도로명 주소
          const postalCode = doc.road_address?.zone_no || null; // 우편번호
          const latitude = doc.y || ''; // 위도
          const longitude = doc.x || ''; // 경도

          return {
            address,
            roadAddress,
            postalCode,
            latitude,
            longitude,
          };
        },
      );

      return {
        meta: response.data.meta,
        addresses,
      };
    } catch (error) {
      this.logger.error('카카오 로컬 API 호출 실패', error);
      throw error;
    }
  }

  async updateAddress(
    userId: number,
    selectedAddress: AddressSearchResult,
  ): Promise<User> {
    const user = await this.findOne(userId);
    // 도로명 주소를 우선적으로 저장하고, 없으면 지번 주소 저장
    user.address = selectedAddress.roadAddress || selectedAddress.address;
    // 위도/경도 저장
    user.latitude =
      selectedAddress.latitude && selectedAddress.latitude !== ''
        ? parseFloat(selectedAddress.latitude)
        : null;
    user.longitude =
      selectedAddress.longitude && selectedAddress.longitude !== ''
        ? parseFloat(selectedAddress.longitude)
        : null;
    await this.userRepository.save(user);

    // UserAddress 리스트가 비어있으면 자동으로 추가하고 기본주소로 설정
    const existingAddresses = await this.userAddressRepository.count({
      where: { user: { id: userId }, deletedAt: IsNull() },
    });

    if (existingAddresses === 0 && user.address && user.latitude && user.longitude) {
      const address = this.userAddressRepository.create({
        user,
        roadAddress: user.address,
        postalCode: selectedAddress.postalCode,
        latitude: user.latitude,
        longitude: user.longitude,
        isDefault: true, // 기본주소로 자동 설정
        isSearchAddress: true, // 검색주소로도 자동 설정
        alias: null,
      });
      await this.userAddressRepository.save(address);
    }

    return user;
  }

  private normalizeTags(tags: string[] = []): string[] {
    const sanitized = tags
      .map((tag) => tag?.trim())
      .filter((tag): tag is string => Boolean(tag && tag.length));
    return Array.from(new Set(sanitized));
  }

  async deleteUser(email: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // User 테이블에서 조회 (soft delete된 레코드 포함)
      const user = await manager.findOne(User, {
        where: { email },
        withDeleted: true,
      });

      // SocialLogin 테이블에서 조회 (soft delete된 레코드 포함)
      const socialLogin = await manager.findOne(SocialLogin, {
        where: { email },
        withDeleted: true,
      });

      if (!user && !socialLogin) {
        throw new NotFoundException('사용자를 찾을 수 없습니다.');
      }

      // 이미 탈퇴한 경우
      if ((user && user.deletedAt) || (socialLogin && socialLogin.deletedAt)) {
        throw new BadRequestException('이미 탈퇴한 계정입니다.');
      }

      // 관련 데이터 정리
      if (user) {
        // refreshToken 제거 및 reRegisterEmailVerified 리셋
        user.refreshToken = null;
        user.reRegisterEmailVerified = false;
        await manager.save(user);
        // soft delete 실행
        await manager.softRemove(user);
      }

      if (socialLogin) {
        // refreshToken 제거 (소셜 로그인은 reRegisterEmailVerified 없음)
        socialLogin.refreshToken = null;
        await manager.save(socialLogin);
        // soft delete 실행
        await manager.softRemove(socialLogin);
      }
    });
  }

  // ========== 주소 리스트 관련 메서드 ==========

  // 주소 리스트 조회 (soft delete 제외)
  async getUserAddresses(userId: number): Promise<UserAddress[]> {
    return this.userAddressRepository.find({
      where: { user: { id: userId }, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async getSocialLoginAddresses(
    socialLoginId: number,
  ): Promise<UserAddress[]> {
    return this.userAddressRepository.find({
      where: { socialLogin: { id: socialLoginId }, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  // 주소 추가 (최대 4개 제한)
  async createUserAddress(
    userId: number,
    dto: CreateUserAddressDto,
  ): Promise<UserAddress> {
    // 활성 주소 개수 확인 (soft delete 제외)
    const activeCount = await this.userAddressRepository.count({
      where: { user: { id: userId }, deletedAt: IsNull() },
    });

    if (activeCount >= 4) {
      throw new BadRequestException('주소는 최대 4개까지만 저장할 수 있습니다.');
    }

    const user = await this.findOne(userId);
    const { selectedAddress, alias, isDefault, isSearchAddress } = dto;

    // 첫 번째 주소면 자동으로 기본 주소 및 검색 주소로 설정
    const shouldSetDefault = activeCount === 0 || isDefault === true;
    const shouldSetSearchAddress =
      activeCount === 0 || isSearchAddress === true;

    // 기본 주소 설정 시 기존 기본 주소 해제
    if (shouldSetDefault) {
      await this.userAddressRepository.update(
        { user: { id: userId }, isDefault: true, deletedAt: IsNull() },
        { isDefault: false },
      );
    }

    // 검색 주소 설정 시 기존 검색 주소 해제
    if (shouldSetSearchAddress) {
      await this.userAddressRepository.update(
        {
          user: { id: userId },
          isSearchAddress: true,
          deletedAt: IsNull(),
        },
        { isSearchAddress: false },
      );
    }

    const address = this.userAddressRepository.create({
      user,
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

  async createSocialLoginAddress(
    socialLoginId: number,
    dto: CreateUserAddressDto,
  ): Promise<UserAddress> {
    // 활성 주소 개수 확인 (soft delete 제외)
    const activeCount = await this.userAddressRepository.count({
      where: { socialLogin: { id: socialLoginId }, deletedAt: IsNull() },
    });

    if (activeCount >= 4) {
      throw new BadRequestException('주소는 최대 4개까지만 저장할 수 있습니다.');
    }

    const socialLogin = await this.socialLoginRepository.findOne({
      where: { id: socialLoginId },
    });
    if (!socialLogin) {
      throw new NotFoundException('SocialLogin not found');
    }

    const { selectedAddress, alias, isDefault, isSearchAddress } = dto;

    // 첫 번째 주소면 자동으로 기본 주소 및 검색 주소로 설정
    const shouldSetDefault = activeCount === 0 || isDefault === true;
    const shouldSetSearchAddress =
      activeCount === 0 || isSearchAddress === true;

    // 기본 주소 설정 시 기존 기본 주소 해제
    if (shouldSetDefault) {
      await this.userAddressRepository.update(
        {
          socialLogin: { id: socialLoginId },
          isDefault: true,
          deletedAt: IsNull(),
        },
        { isDefault: false },
      );
    }

    // 검색 주소 설정 시 기존 검색 주소 해제
    if (shouldSetSearchAddress) {
      await this.userAddressRepository.update(
        {
          socialLogin: { id: socialLoginId },
          isSearchAddress: true,
          deletedAt: IsNull(),
        },
        { isSearchAddress: false },
      );
    }

    const address = this.userAddressRepository.create({
      socialLogin,
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

  // 주소 수정 (부분 수정 가능)
  async updateUserAddress(
    addressId: number,
    userId: number,
    dto: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, user: { id: userId }, deletedAt: IsNull() },
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    // 기본 주소 설정 시 기존 기본 주소 해제
    if (dto.isDefault === true && !address.isDefault) {
      await this.userAddressRepository.update(
        { user: { id: userId }, isDefault: true, deletedAt: IsNull() },
        { isDefault: false },
      );
    }

    // 검색 주소 설정 시 기존 검색 주소 해제
    if (dto.isSearchAddress === true && !address.isSearchAddress) {
      await this.userAddressRepository.update(
        {
          user: { id: userId },
          isSearchAddress: true,
          deletedAt: IsNull(),
        },
        { isSearchAddress: false },
      );
    }

    // 부분 업데이트
    if (dto.roadAddress !== undefined) {
      address.roadAddress = dto.roadAddress;
    }
    if (dto.latitude !== undefined) {
      address.latitude = dto.latitude;
    }
    if (dto.longitude !== undefined) {
      address.longitude = dto.longitude;
    }
    if (dto.alias !== undefined) {
      address.alias = dto.alias;
    }
    if (dto.isDefault !== undefined) {
      address.isDefault = dto.isDefault;
    }
    if (dto.isSearchAddress !== undefined) {
      address.isSearchAddress = dto.isSearchAddress;
    }

    return this.userAddressRepository.save(address);
  }

  async updateSocialLoginAddress(
    addressId: number,
    socialLoginId: number,
    dto: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: {
        id: addressId,
        socialLogin: { id: socialLoginId },
        deletedAt: IsNull(),
      },
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    // 기본 주소 설정 시 기존 기본 주소 해제
    if (dto.isDefault === true && !address.isDefault) {
      await this.userAddressRepository.update(
        {
          socialLogin: { id: socialLoginId },
          isDefault: true,
          deletedAt: IsNull(),
        },
        { isDefault: false },
      );
    }

    // 검색 주소 설정 시 기존 검색 주소 해제
    if (dto.isSearchAddress === true && !address.isSearchAddress) {
      await this.userAddressRepository.update(
        {
          socialLogin: { id: socialLoginId },
          isSearchAddress: true,
          deletedAt: IsNull(),
        },
        { isSearchAddress: false },
      );
    }

    // 부분 업데이트
    if (dto.roadAddress !== undefined) {
      address.roadAddress = dto.roadAddress;
    }
    if (dto.latitude !== undefined) {
      address.latitude = dto.latitude;
    }
    if (dto.longitude !== undefined) {
      address.longitude = dto.longitude;
    }
    if (dto.alias !== undefined) {
      address.alias = dto.alias;
    }
    if (dto.isDefault !== undefined) {
      address.isDefault = dto.isDefault;
    }
    if (dto.isSearchAddress !== undefined) {
      address.isSearchAddress = dto.isSearchAddress;
    }

    return this.userAddressRepository.save(address);
  }

  // 주소 삭제 (soft delete)
  async deleteUserAddress(addressId: number, userId: number): Promise<void> {
    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, user: { id: userId }, deletedAt: IsNull() },
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    // 기본 주소 삭제 시 다른 주소를 기본으로 설정 (있는 경우)
    if (address.isDefault) {
      const otherAddress = await this.userAddressRepository.findOne({
        where: {
          user: { id: userId },
          id: Not(addressId),
          deletedAt: IsNull(),
        },
      });
      if (otherAddress) {
        otherAddress.isDefault = true;
        await this.userAddressRepository.save(otherAddress);
      }
    }

    // 검색 주소 삭제 시 다른 주소를 검색 주소로 설정 (있는 경우)
    if (address.isSearchAddress) {
      const otherAddress = await this.userAddressRepository.findOne({
        where: {
          user: { id: userId },
          id: Not(addressId),
          deletedAt: IsNull(),
        },
      });
      if (otherAddress) {
        otherAddress.isSearchAddress = true;
        await this.userAddressRepository.save(otherAddress);
      }
    }

    await this.userAddressRepository.softRemove(address);
  }

  async deleteSocialLoginAddress(
    addressId: number,
    socialLoginId: number,
  ): Promise<void> {
    const address = await this.userAddressRepository.findOne({
      where: {
        id: addressId,
        socialLogin: { id: socialLoginId },
        deletedAt: IsNull(),
      },
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    // 기본 주소 삭제 시 다른 주소를 기본으로 설정 (있는 경우)
    if (address.isDefault) {
      const otherAddress = await this.userAddressRepository.findOne({
        where: {
          socialLogin: { id: socialLoginId },
          id: Not(addressId),
          deletedAt: IsNull(),
        },
      });
      if (otherAddress) {
        otherAddress.isDefault = true;
        await this.userAddressRepository.save(otherAddress);
      }
    }

    // 검색 주소 삭제 시 다른 주소를 검색 주소로 설정 (있는 경우)
    if (address.isSearchAddress) {
      const otherAddress = await this.userAddressRepository.findOne({
        where: {
          socialLogin: { id: socialLoginId },
          id: Not(addressId),
          deletedAt: IsNull(),
        },
      });
      if (otherAddress) {
        otherAddress.isSearchAddress = true;
        await this.userAddressRepository.save(otherAddress);
      }
    }

    await this.userAddressRepository.softRemove(address);
  }

  // 여러 주소 한번에 삭제 (기본주소 제외, 최대 3개까지)
  async deleteUserAddresses(
    addressIds: number[],
    userId: number,
  ): Promise<void> {
    if (!addressIds || addressIds.length === 0) {
      throw new BadRequestException('삭제할 주소 ID가 없습니다.');
    }

    // 삭제할 주소들 조회
    const addresses = await this.userAddressRepository.find({
      where: {
        id: In(addressIds),
        user: { id: userId },
        deletedAt: IsNull(),
      },
    });

    // 존재하지 않는 주소 ID 확인
    const foundIds = addresses.map((addr) => addr.id);
    const notFoundIds = addressIds.filter((id) => !foundIds.includes(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `주소를 찾을 수 없습니다. ID: ${notFoundIds.join(', ')}`,
      );
    }

    // 기본 주소가 포함되어 있는지 확인
    const defaultAddresses = addresses.filter((addr) => addr.isDefault);
    if (defaultAddresses.length > 0) {
      throw new BadRequestException(
        '기본 주소는 삭제할 수 없습니다. 기본 주소를 변경한 후 삭제해주세요.',
      );
    }

    // 검색 주소가 삭제되는지 확인
    const deletedSearchAddresses = addresses.filter(
      (addr) => addr.isSearchAddress,
    );

    // 삭제 실행
    for (const address of addresses) {
      await this.userAddressRepository.softRemove(address);
    }

    // 검색 주소가 삭제된 경우 다른 주소를 검색 주소로 설정
    if (deletedSearchAddresses.length > 0) {
      const remainingAddress = await this.userAddressRepository.findOne({
        where: {
          user: { id: userId },
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

  async deleteSocialLoginAddresses(
    addressIds: number[],
    socialLoginId: number,
  ): Promise<void> {
    if (!addressIds || addressIds.length === 0) {
      throw new BadRequestException('삭제할 주소 ID가 없습니다.');
    }

    // 삭제할 주소들 조회
    const addresses = await this.userAddressRepository.find({
      where: {
        id: In(addressIds),
        socialLogin: { id: socialLoginId },
        deletedAt: IsNull(),
      },
    });

    // 존재하지 않는 주소 ID 확인
    const foundIds = addresses.map((addr) => addr.id);
    const notFoundIds = addressIds.filter((id) => !foundIds.includes(id));
    if (notFoundIds.length > 0) {
      throw new NotFoundException(
        `주소를 찾을 수 없습니다. ID: ${notFoundIds.join(', ')}`,
      );
    }

    // 기본 주소가 포함되어 있는지 확인
    const defaultAddresses = addresses.filter((addr) => addr.isDefault);
    if (defaultAddresses.length > 0) {
      throw new BadRequestException(
        '기본 주소는 삭제할 수 없습니다. 기본 주소를 변경한 후 삭제해주세요.',
      );
    }

    // 검색 주소가 삭제되는지 확인
    const deletedSearchAddresses = addresses.filter(
      (addr) => addr.isSearchAddress,
    );

    // 삭제 실행
    for (const address of addresses) {
      await this.userAddressRepository.softRemove(address);
    }

    // 검색 주소가 삭제된 경우 다른 주소를 검색 주소로 설정
    if (deletedSearchAddresses.length > 0) {
      const remainingAddress = await this.userAddressRepository.findOne({
        where: {
          socialLogin: { id: socialLoginId },
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

  // 기본 주소 설정
  async setDefaultUserAddress(
    addressId: number,
    userId: number,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, user: { id: userId }, deletedAt: IsNull() },
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    // 기존 기본 주소 해제
    await this.userAddressRepository.update(
      { user: { id: userId }, isDefault: true, deletedAt: IsNull() },
      { isDefault: false },
    );

    // 새 기본 주소 설정
    address.isDefault = true;
    return this.userAddressRepository.save(address);
  }

  async setDefaultSocialLoginAddress(
    addressId: number,
    socialLoginId: number,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: {
        id: addressId,
        socialLogin: { id: socialLoginId },
        deletedAt: IsNull(),
      },
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    // 기존 기본 주소 해제
    await this.userAddressRepository.update(
      {
        socialLogin: { id: socialLoginId },
        isDefault: true,
        deletedAt: IsNull(),
      },
      { isDefault: false },
    );

    // 새 기본 주소 설정
    address.isDefault = true;
    return this.userAddressRepository.save(address);
  }

  // 검색 주소 설정
  async setSearchUserAddress(
    addressId: number,
    userId: number,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: { id: addressId, user: { id: userId }, deletedAt: IsNull() },
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    // 기존 검색 주소 해제
    await this.userAddressRepository.update(
      {
        user: { id: userId },
        isSearchAddress: true,
        deletedAt: IsNull(),
      },
      { isSearchAddress: false },
    );

    // 새 검색 주소 설정
    address.isSearchAddress = true;
    return this.userAddressRepository.save(address);
  }

  async setSearchSocialLoginAddress(
    addressId: number,
    socialLoginId: number,
  ): Promise<UserAddress> {
    const address = await this.userAddressRepository.findOne({
      where: {
        id: addressId,
        socialLogin: { id: socialLoginId },
        deletedAt: IsNull(),
      },
    });

    if (!address) {
      throw new NotFoundException('주소를 찾을 수 없습니다.');
    }

    // 기존 검색 주소 해제
    await this.userAddressRepository.update(
      {
        socialLogin: { id: socialLoginId },
        isSearchAddress: true,
        deletedAt: IsNull(),
      },
      { isSearchAddress: false },
    );

    // 새 검색 주소 설정
    address.isSearchAddress = true;
    return this.userAddressRepository.save(address);
  }

  // 기본 주소 조회
  async getDefaultUserAddress(userId: number): Promise<UserAddress | null> {
    return this.userAddressRepository.findOne({
      where: { user: { id: userId }, isDefault: true, deletedAt: IsNull() },
    });
  }

  async getDefaultSocialLoginAddress(
    socialLoginId: number,
  ): Promise<UserAddress | null> {
    return this.userAddressRepository.findOne({
      where: {
        socialLogin: { id: socialLoginId },
        isDefault: true,
        deletedAt: IsNull(),
      },
    });
  }

  // 검색 주소 조회
  async getSearchUserAddress(userId: number): Promise<UserAddress | null> {
    return this.userAddressRepository.findOne({
      where: {
        user: { id: userId },
        isSearchAddress: true,
        deletedAt: IsNull(),
      },
    });
  }

  async getSearchSocialLoginAddress(
    socialLoginId: number,
  ): Promise<UserAddress | null> {
    return this.userAddressRepository.findOne({
      where: {
        socialLogin: { id: socialLoginId },
        isSearchAddress: true,
        deletedAt: IsNull(),
      },
    });
  }
}
