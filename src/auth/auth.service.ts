// src/auth/auth.service.ts
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosResponse } from 'axios';
import * as bcrypt from 'bcrypt';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { SocialLogin } from '../user/entities/social-login.entity';
import { User } from '../user/entities/user.entity';
import { SocialType } from '../user/enum/social-type.enum';
import { UserService } from '../user/user.service';
import { AccessTokenDto } from './dto/access-token.dto';
import { GoogleProfileDto } from './dto/google-profile.dto';
import { KakaoProfileDto } from './dto/kakao-profile.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtTokenProvider } from './provider/jwt-token.provider';

export interface AuthResult {
  id: number;
  token: string;
  refreshToken: string;
  email: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  name: string | null;
}

export interface AuthProfile {
  id: number;
  email: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

type AuthEntity = User | SocialLogin;

@Injectable()
export class AuthService {
  private readonly kakaoClientIdEnv = 'b82967657cb741bb3c4173fdfe1dc0b7';
  private readonly kakaoRedirectUriEnv =
    'http://localhost:8080/oauth/kakao/redirect';

  private readonly googleClientIdEnv = process.env.OAUTH_GOOGLE_CLIENT_ID;
  private readonly googleClientSecretEnv =
    process.env.OAUTH_GOOGLE_CLIENT_SECRET;
  private readonly googleRedirectUriEnv =
    process.env.OAUTH_GOOGLE_REDIRECT_URI;
  private readonly refreshTokenSecret =
    process.env.JWT_REFRESH_SECRET ?? 'refreshSecret';
  private readonly refreshTokenExpiresIn = '7d';

  constructor(
    private readonly httpService: HttpService,
    private readonly userService: UserService,
    private readonly jwtTokenProvider: JwtTokenProvider,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SocialLogin)
    private readonly socialLoginRepository: Repository<SocialLogin>,
    private readonly jwtService: JwtService,
  ) {}

  async kakaoLogin(code: string): Promise<AuthResult> {
    // 1) 인가코드로 액세스 토큰 발급
    const accessTokenDto = await this.getKakaoAccessToken(code);

    // 2) 토큰으로 카카오 프로필 조회
    const kakaoProfileDto = await this.getKakaoProfile(
      accessTokenDto.access_token,
    );
    return this.processKakaoProfile(kakaoProfileDto);
  }

  async kakaoLoginWithToken(accessToken: string): Promise<AuthResult> {
    const kakaoProfileDto = await this.getKakaoProfile(accessToken);
    return this.processKakaoProfile(kakaoProfileDto);
  }

  private async getKakaoAccessToken(code: string): Promise<AccessTokenDto> {
    const clientId = this.kakaoClientIdEnv;
    const redirectUri = this.kakaoRedirectUriEnv;
    if (!clientId || !redirectUri) {
      throw new Error(
        'Kakao OAuth env missing: OAUTH_KAKAO_CLIENT_ID or OAUTH_KAKAO_REDIRECT_URI',
      );
    }
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');

    console.log('=== 카카오 토큰 요청 정보 ===');
    console.log('인가코드:', code);
    console.log('Client ID:', clientId);
    console.log('Redirect URI:', redirectUri);
    console.log('요청 URL:', 'https://kauth.kakao.com/oauth/token');

    try {
      const response = await firstValueFrom<AxiosResponse<AccessTokenDto>>(
        this.httpService.post<AccessTokenDto>(
          'https://kauth.kakao.com/oauth/token',
          params.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      console.log('=== 카카오 토큰 응답 성공 ===');
      console.log('응답 accesstoken JSON', response.data);
      return response.data;
    } catch (error: any) {
      console.error('=== 카카오 API 에러 발생 ===');
      console.error('에러 타입:', error.name);
      console.error('에러 메시지:', error.message);

      if (error.response) {
        console.error('응답 상태 코드:', error.response.status);
        console.error('응답 상태 텍스트:', error.response.statusText);
        console.error('응답 헤더:', JSON.stringify(error.response.headers));
        console.error('응답 데이터:', JSON.stringify(error.response.data));
        console.error('요청 URL:', error.config?.url);
        console.error('요청 메서드:', error.config?.method);
        console.error('요청 데이터:', error.config?.data);
      } else if (error.request) {
        console.error('요청은 보냈지만 응답을 받지 못함:', error.request);
      } else {
        console.error('에러 설정:', error.config);
      }

      throw error;
    }
  }

  private async getKakaoProfile(token: string): Promise<KakaoProfileDto> {
    const response = await firstValueFrom<AxiosResponse<KakaoProfileDto>>(
      this.httpService.get<KakaoProfileDto>(
        'https://kapi.kakao.com/v2/user/me',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      ),
    );

    console.log('profile JSON', response.data);
    return response.data;
  }

  private async processKakaoProfile(
    kakaoProfileDto: KakaoProfileDto,
  ): Promise<AuthResult> {
    let originalUser = await this.userService.getUserBySocialId(
      kakaoProfileDto.id,
    );

    if (!originalUser) {
      const email = kakaoProfileDto.kakao_account.email;
      if (!email) {
        throw new Error(
          'Kakao profile does not include email. Enable email scope.',
        );
      }
      const profileImage = kakaoProfileDto.properties?.profile_image;
      originalUser = await this.userService.createOauth(
        kakaoProfileDto.id,
        email,
        SocialType.KAKAO,
        profileImage,
      );
    }

    return this.buildAuthResult(originalUser);
  }

  async googleLogin(code: string): Promise<AuthResult> {
    // 1) 인가코드로 액세스 토큰 발급
    const accessTokenDto = await this.getGoogleAccessToken(code);

    // 2) 토큰으로 구글 프로필 조회
    const googleProfileDto = await this.getGoogleProfile(
      accessTokenDto.access_token,
    );
    return this.processGoogleProfile(googleProfileDto);
  }

  private async getGoogleAccessToken(code: string): Promise<AccessTokenDto> {
    const clientId = this.googleClientIdEnv;
    const clientSecret = this.googleClientSecretEnv;
    const redirectUri = this.googleRedirectUriEnv;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Google OAuth env missing: OAUTH_GOOGLE_CLIENT_ID, OAUTH_GOOGLE_CLIENT_SECRET, or OAUTH_GOOGLE_REDIRECT_URI',
      );
    }
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');

    console.log('=== 구글 토큰 요청 정보 ===');
    console.log('인가코드:', code);
    console.log('Client ID:', clientId);
    console.log('Redirect URI:', redirectUri);
    console.log('요청 URL:', 'https://oauth2.googleapis.com/token');

    try {
      const response = await firstValueFrom<AxiosResponse<AccessTokenDto>>(
        this.httpService.post<AccessTokenDto>(
          'https://oauth2.googleapis.com/token',
          params.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      console.log('=== 구글 토큰 응답 성공 ===');
      console.log('응답 accesstoken JSON', response.data);
      return response.data;
    } catch (error: any) {
      console.error('=== 구글 API 에러 발생 ===');
      console.error('에러 타입:', error.name);
      console.error('에러 메시지:', error.message);

      if (error.response) {
        console.error('응답 상태 코드:', error.response.status);
        console.error('응답 상태 텍스트:', error.response.statusText);
        console.error('응답 헤더:', JSON.stringify(error.response.headers));
        console.error('응답 데이터:', JSON.stringify(error.response.data));
        console.error('요청 URL:', error.config?.url);
        console.error('요청 메서드:', error.config?.method);
        console.error('요청 데이터:', error.config?.data);
      } else if (error.request) {
        console.error('요청은 보냈지만 응답을 받지 못함:', error.request);
      } else {
        console.error('에러 설정:', error.config);
      }

      throw error;
    }
  }

  private async getGoogleProfile(token: string): Promise<GoogleProfileDto> {
    const response = await firstValueFrom<AxiosResponse<GoogleProfileDto>>(
      this.httpService.get<GoogleProfileDto>(
        'https://openidconnect.googleapis.com/v1/userinfo',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      ),
    );

    console.log('profile JSON', response.data);
    return response.data;
  }

  private async processGoogleProfile(
    googleProfileDto: GoogleProfileDto,
  ): Promise<AuthResult> {
    let originalUser = await this.userService.getUserBySocialId(
      googleProfileDto.sub,
    );

    if (!originalUser) {
      const email = googleProfileDto.email;
      if (!email) {
        throw new Error(
          'Google profile does not include email. Enable email scope.',
        );
      }
      const profileImage = googleProfileDto.picture;
      const name = googleProfileDto.name;
      originalUser = await this.userService.createOauth(
        googleProfileDto.sub,
        email,
        SocialType.GOOGLE,
        profileImage,
        name,
      );
    }

    return this.buildAuthResult(originalUser);
  }

  async register(registerDto: RegisterDto) {
    // 이메일 중복 확인
    const existingUser = await this.userService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new BadRequestException('이미 등록된 이메일입니다.');
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // 일반 회원가입은 User 테이블에 저장
    await this.userService.createUser({
      email: registerDto.email,
      password: hashedPassword,
      role: 'USER',
      name: registerDto.name,
    });

    // 회원가입 성공 메시지만 반환
    return {
      message: '회원가입이 완료되었습니다.',
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResult> {
    // 사용자 조회
    const user = await this.userService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    // 비밀번호 확인 (소셜 로그인 사용자는 password가 null일 수 있음)
    if (!user.password) {
      throw new UnauthorizedException('소셜 로그인으로 가입한 계정입니다.');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    return this.buildAuthResult(user);
  }

  async checkEmail(email: string) {
    const existingUser = await this.userService.findByEmail(email);
    return {
      available: !existingUser,
      message: existingUser
        ? '이미 사용 중인 이메일입니다.'
        : '사용 가능한 이메일입니다.',
    };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken: string }> {
    try {
      // refresh token 검증
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshTokenSecret,
      });

      // refresh token 타입 확인
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
      }

      // 사용자 조회 (User 또는 SocialLogin)
      const user = await this.userService.findByEmail(payload.email);
      const socialLogin = user
        ? null
        : await this.userService.findSocialLoginByEmail(payload.email);

      if (!user && !socialLogin) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }

      // 저장된 refresh token과 비교
      const storedRefreshToken = user?.refreshToken || socialLogin?.refreshToken;
      if (storedRefreshToken !== refreshToken) {
        throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
      }

      // 새로운 access token 발급
      const targetUser = user || socialLogin;
      if (!targetUser) {
        throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      }
      const newAccessToken = this.jwtTokenProvider.createToken(
        targetUser.email,
        targetUser.role.toString(),
      );
      const newRefreshToken = this.jwtTokenProvider.createRefreshToken(
        targetUser.email,
        targetUser.role.toString(),
      );
      await this.persistRefreshToken(targetUser, newRefreshToken);
      console.log('refresh token으로 access token 재발급 성공');

      return {
        token: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        if (error.message === 'jwt expired') {
          console.warn('access token이 만료되었습니다.');
        }
        throw error;
      }
      if (error instanceof Error && error.message === 'jwt expired') {
        console.warn('access token이 만료되었습니다.');
      }
      throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
    }
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshTokenSecret,
      });
      const entity =
        (await this.userService.findByEmail(payload.email)) ??
        (await this.userService.findSocialLoginByEmail(payload.email));
      if (entity && entity.refreshToken === refreshToken) {
        await this.persistRefreshToken(entity, null);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.warn('logout refresh token 검증 실패:', error.message);
      }
    }
  }

  async getUserProfile(email: string): Promise<AuthProfile> {
    const { user, socialLogin } =
      await this.userService.findUserOrSocialLoginByEmail(email);
    const entity = user ?? socialLogin;
    if (!entity) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }
    return {
      id: entity.id,
      email: entity.email,
      name: this.nullableString(entity.name),
      address: this.nullableString(entity.address),
      latitude: this.nullableNumber(entity.latitude),
      longitude: this.nullableNumber(entity.longitude),
    };
  }

  private async buildAuthResult(entity: AuthEntity): Promise<AuthResult> {
    const { token, refreshToken } = await this.issueTokens(entity);
    return {
      id: entity.id,
      email: entity.email,
      token,
      refreshToken,
      address: this.nullableString(entity.address),
      latitude: this.nullableNumber(entity.latitude),
      longitude: this.nullableNumber(entity.longitude),
      name: this.nullableString(entity.name),
    };
  }

  private async issueTokens(entity: AuthEntity) {
    const token = this.jwtTokenProvider.createToken(
      entity.email,
      entity.role.toString(),
    );
    const refreshToken = this.jwtTokenProvider.createRefreshToken(
      entity.email,
      entity.role.toString(),
    );
    await this.persistRefreshToken(entity, refreshToken);
    return { token, refreshToken };
  }

  private async persistRefreshToken(
    entity: AuthEntity,
    refreshToken: string | null,
  ): Promise<void> {
    entity.refreshToken = refreshToken;
    if (entity instanceof User) {
      await this.userRepository.save(entity);
    } else {
      await this.socialLoginRepository.save(entity);
    }
  }

  private nullableString(value: string | null | undefined): string | null {
    return value ?? null;
  }

  private nullableNumber(value: number | null | undefined): number | null {
    return value ?? null;
  }
}
