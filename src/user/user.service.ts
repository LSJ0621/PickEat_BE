import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { DataSource, EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { SearchAddressDto } from './dto/search-address.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SocialLogin } from './entities/social-login.entity';
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
    private readonly dataSource: DataSource,
  ) {
    this.kakaoApiKey = process.env.KAKAO_REST_API_KEY || '';
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

  async updateSocialLoginAddress(
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
    return this.socialLoginRepository.save(socialLogin);
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
    return user.preferences ?? defaultUserPreferences();
  }

  async updatePreferences(
    userId: number,
    likes?: string[],
    dislikes?: string[],
  ): Promise<UserPreferences> {
    const user = await this.findOne(userId);
    const currentPreferences = user.preferences ?? defaultUserPreferences();
    
    // 좋아하는 것과 싫어하는 것을 각각 정규화
    const normalizedLikes = likes !== undefined 
      ? this.normalizeTags(likes) 
      : currentPreferences.likes;
    const normalizedDislikes = dislikes !== undefined 
      ? this.normalizeTags(dislikes) 
      : currentPreferences.dislikes;
    
    user.preferences = {
      likes: normalizedLikes,
      dislikes: normalizedDislikes,
    };
    await this.userRepository.save(user);
    return user.preferences;
  }

  async getSocialLoginPreferences(socialLoginId: number): Promise<UserPreferences> {
    const socialLogin = await this.socialLoginRepository.findOne({
      where: { id: socialLoginId },
    });
    if (!socialLogin) {
      throw new NotFoundException('SocialLogin not found');
    }
    return socialLogin.preferences ?? defaultUserPreferences();
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
    const currentPreferences = socialLogin.preferences ?? defaultUserPreferences();
    
    // 좋아하는 것과 싫어하는 것을 각각 정규화
    const normalizedLikes = likes !== undefined 
      ? this.normalizeTags(likes) 
      : currentPreferences.likes;
    const normalizedDislikes = dislikes !== undefined 
      ? this.normalizeTags(dislikes) 
      : currentPreferences.dislikes;
    
    socialLogin.preferences = {
      likes: normalizedLikes,
      dislikes: normalizedDislikes,
    };
    await this.socialLoginRepository.save(socialLogin);
    return socialLogin.preferences;
  }

  async searchAddress(searchDto: SearchAddressDto): Promise<AddressSearchResponse> {
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
}
