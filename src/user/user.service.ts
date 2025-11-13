import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosInstance } from 'axios';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { SearchAddressDto } from './dto/search-address.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async getOrFailByEmail(email: string): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }
    return user;
  }

  async getUserBySocialId(socialId: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { socialId: socialId.toString() },
    });
  }

  async createOauth(
    socialId: number,
    email: string,
    socialType: SocialType,
    profileImage?: string,
  ): Promise<User> {
    const user = this.userRepository.create({
      email,
      socialId: socialId.toString(),
      socialType,
      role: 'USER',
      profileImage,
    });
    return this.userRepository.save(user);
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
    await this.userRepository.update(id, updateUserDto);
    return this.findOne(id);
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
    tags: string[],
  ): Promise<UserPreferences> {
    const user = await this.findOne(userId);
    const normalizedTags = this.normalizeTags(tags);
    user.preferences = { tags: normalizedTags };
    await this.userRepository.save(user);
    return user.preferences;
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
}
