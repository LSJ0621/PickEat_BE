// src/auth/auth.service.ts
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { AxiosResponse } from 'axios';
import * as bcrypt from 'bcrypt';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { SocialLogin } from '../user/entities/social-login.entity';
import { User } from '../user/entities/user.entity';
import { SocialType } from '../user/enum/social-type.enum';
import { UserPreferences } from '../user/interfaces/user-preferences.interface';
import { UserService } from '../user/user.service';
import { AccessTokenDto } from './dto/access-token.dto';
import { GoogleProfileDto } from './dto/google-profile.dto';
import { KakaoProfileDto } from './dto/kakao-profile.dto';
import { LoginDto } from './dto/login.dto';
import { ReRegisterSocialDto } from './dto/re-register-social.dto';
import { ReRegisterDto } from './dto/re-register.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailPurpose } from './dto/send-email-code.dto';
import { JwtTokenProvider } from './provider/jwt-token.provider';
import { EmailVerificationService } from './services/email-verification.service';

export interface AuthResult {
  id: number;
  token: string;
  refreshToken: string;
  email: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  name: string | null;
  preferences: UserPreferences | null;
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
  private readonly kakaoClientIdEnv: string;
  private readonly kakaoRedirectUriEnv: string;
  private readonly googleClientIdEnv: string;
  private readonly googleClientSecretEnv: string;
  private readonly googleRedirectUriEnv: string;
  private readonly refreshTokenSecret: string;
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
    private readonly emailVerificationService: EmailVerificationService,
    private readonly config: ConfigService,
  ) {
    this.kakaoClientIdEnv = this.config.get<string>(
      'OAUTH_KAKAO_CLIENT_ID',
      'b82967657cb741bb3c4173fdfe1dc0b7',
    );
    this.kakaoRedirectUriEnv = this.config.get<string>(
      'OAUTH_KAKAO_REDIRECT_URI',
      'http://localhost:8080/oauth/kakao/redirect',
    );
    this.googleClientIdEnv = this.config.get<string>(
      'OAUTH_GOOGLE_CLIENT_ID',
      '',
    );
    this.googleClientSecretEnv = this.config.get<string>(
      'OAUTH_GOOGLE_CLIENT_SECRET',
      '',
    );
    this.googleRedirectUriEnv = this.config.get<string>(
      'OAUTH_GOOGLE_REDIRECT_URI',
      '',
    );
    this.refreshTokenSecret = this.config.get<string>(
      'JWT_REFRESH_SECRET',
      'refreshSecret',
    );
  }

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

    return response.data;
  }

  private async processKakaoProfile(
    kakaoProfileDto: KakaoProfileDto,
  ): Promise<AuthResult> {
    const email = kakaoProfileDto.kakao_account.email;
    if (!email) {
      throw new Error(
        'Kakao profile does not include email. Enable email scope.',
      );
    }

    // User 테이블에 활성 사용자가 존재하는지 확인
    const activeUser = await this.userRepository.findOne({
      where: { email },
    });

    if (activeUser) {
      throw new BadRequestException(
        '이미 일반 회원가입으로 가입한 이메일입니다.',
      );
    }

    let originalUser = await this.userService.getUserBySocialId(
      kakaoProfileDto.id,
    );

    if (!originalUser) {
      const profileImage = kakaoProfileDto.properties?.profile_image;
      originalUser = await this.userService.createOauth(
        kakaoProfileDto.id,
        email,
        SocialType.KAKAO,
        profileImage,
      );
    } else if (originalUser.deletedAt) {
      // 탈퇴한 유저는 재가입 필요 에러 반환 (재가입은 별도 엔드포인트로 처리)
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: '탈퇴한 이력이 있습니다. 재가입하시겠습니까?',
          error: 'RE_REGISTER_REQUIRED',
          email: email, // 프론트엔드에서 재가입 API 호출 시 사용할 이메일
        },
        HttpStatus.BAD_REQUEST,
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

    return response.data;
  }

  private async processGoogleProfile(
    googleProfileDto: GoogleProfileDto,
  ): Promise<AuthResult> {
    const email = googleProfileDto.email;
    if (!email) {
      throw new Error(
        'Google profile does not include email. Enable email scope.',
      );
    }

    // User 테이블에 활성 사용자가 존재하는지 확인
    const activeUser = await this.userRepository.findOne({
      where: { email },
    });

    if (activeUser) {
      throw new BadRequestException(
        '이미 일반 회원가입으로 가입한 이메일입니다.',
      );
    }

    let originalUser = await this.userService.getUserBySocialId(
      googleProfileDto.sub,
    );

    if (!originalUser) {
      const profileImage = googleProfileDto.picture;
      const name = googleProfileDto.name;
      originalUser = await this.userService.createOauth(
        googleProfileDto.sub,
        email,
        SocialType.GOOGLE,
        profileImage,
        name,
      );
    } else if (originalUser.deletedAt) {
      // 탈퇴한 유저는 재가입 필요 에러 반환 (재가입은 별도 엔드포인트로 처리)
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: '탈퇴한 이력이 있습니다. 재가입하시겠습니까?',
          error: 'RE_REGISTER_REQUIRED',
          email: email, // 프론트엔드에서 재가입 API 호출 시 사용할 이메일
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.buildAuthResult(originalUser);
  }

  async register(registerDto: RegisterDto) {
    // 이메일 중복 확인 (User와 SocialLogin 두 테이블 모두 확인)
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
      withDeleted: true,
    });
    const existingSocialLogin = await this.socialLoginRepository.findOne({
      where: { email: registerDto.email },
      withDeleted: true,
    });

    // 활성 사용자가 존재하는 경우
    if (existingUser && !existingUser.deletedAt) {
      throw new BadRequestException('이미 등록된 이메일입니다.');
    }
    if (existingSocialLogin && !existingSocialLogin.deletedAt) {
      throw new BadRequestException('이미 등록된 이메일입니다.');
    }

    // soft delete된 사용자만 존재하면 재가입 플로우로 유도
    if (
      (existingUser && existingUser.deletedAt) ||
      (existingSocialLogin && existingSocialLogin.deletedAt)
    ) {
      throw new BadRequestException(
        '기존에 탈퇴 이력이 있습니다. 재가입을 진행해주세요.',
      );
    }

    // 이메일 인증 완료 여부 확인
    const isEmailVerified = await this.emailVerificationService.isEmailVerified(
      registerDto.email,
      EmailPurpose.SIGNUP,
    );

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // 일반 회원가입은 User 테이블에 저장
    const user = await this.userService.createUser({
      email: registerDto.email,
      password: hashedPassword,
      role: 'USER',
      name: registerDto.name,
    });

    // 이메일 인증이 완료된 경우 emailVerified 설정
    if (isEmailVerified) {
      await this.userService.markEmailVerified(registerDto.email);
      await this.emailVerificationService.expireVerification(
        registerDto.email,
        EmailPurpose.SIGNUP,
      );
    }

    // 회원가입 성공 메시지만 반환
    return {
      message: '회원가입이 완료되었습니다.',
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResult> {
    // 사용자 조회 (soft delete 포함)
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
      withDeleted: true,
    });

    // User 테이블에 없으면 SocialLogin 테이블 확인
    if (!user) {
      const socialLogin = await this.socialLoginRepository.findOne({
        where: { email: loginDto.email },
        withDeleted: true,
      });
      if (socialLogin) {
        // 탈퇴한 계정이거나 소셜 로그인 계정인 경우 일반적인 에러 메시지 반환 (보안상)
        throw new UnauthorizedException(
          '이메일 또는 비밀번호가 올바르지 않습니다.',
        );
      }
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    // 탈퇴한 사용자인 경우 일반적인 에러 메시지 반환 (보안상)
    if (user.deletedAt) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
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
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    return this.buildAuthResult(user);
  }

  async checkEmail(email: string) {
    // User와 SocialLogin 두 테이블 모두 확인 (soft delete 포함)
    const existingUser = await this.userRepository.findOne({
      where: { email },
      withDeleted: true,
    });
    const existingSocialLogin = await this.socialLoginRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    // 활성 사용자가 존재하는 경우
    if (existingUser && !existingUser.deletedAt) {
      return {
        available: false,
        message: '이미 사용 중인 이메일입니다.',
      };
    }
    if (existingSocialLogin && !existingSocialLogin.deletedAt) {
      return {
        available: false,
        message: '이미 사용 중인 이메일입니다.',
      };
    }

    // 탈퇴한 사용자인 경우
    if (existingUser && existingUser.deletedAt) {
      return {
        available: false,
        canReRegister: true,
        message: '기존에 탈퇴 이력이 있습니다. 재가입하시겠습니까?',
      };
    }
    if (existingSocialLogin && existingSocialLogin.deletedAt) {
      return {
        available: false,
        canReRegister: true,
        message: '기존에 탈퇴 이력이 있습니다. 재가입하시겠습니까?',
      };
    }

    // 사용 가능한 경우
    return {
      available: true,
      message: '사용 가능한 이메일입니다.',
    };
  }

  async sendResetPasswordCode(email: string): Promise<{
    remainCount: number;
    message: string;
  }> {
    await this.ensureRegularUserAccount(email);
    return this.emailVerificationService.sendCode(
      email,
      EmailPurpose.RESET_PASSWORD,
    );
  }

  async verifyResetPasswordCode(email: string, code: string): Promise<void> {
    await this.ensureRegularUserAccount(email);
    await this.emailVerificationService.verifyCode(
      email,
      code,
      EmailPurpose.RESET_PASSWORD,
    );
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const isEmailVerified = await this.emailVerificationService.isEmailVerified(
      resetPasswordDto.email,
      EmailPurpose.RESET_PASSWORD,
    );
    if (!isEmailVerified) {
      throw new BadRequestException('이메일 인증이 완료되지 않았습니다.');
    }

    const user = await this.ensureRegularUserAccount(resetPasswordDto.email);
    this.ensurePasswordChangeAllowed(user);
    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    await this.userService.updatePassword(user, hashedPassword);
    await this.userService.markEmailVerified(resetPasswordDto.email);
    await this.emailVerificationService.expireVerification(
      resetPasswordDto.email,
      EmailPurpose.RESET_PASSWORD,
    );
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
      const storedRefreshToken =
        user?.refreshToken || socialLogin?.refreshToken;
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
      preferences: this.extractPreferences(entity),
    };
  }

  private extractPreferences(entity: AuthEntity): UserPreferences | null {
    const preferences =
      entity instanceof User ? entity.preferences : entity.preferences;
    return preferences ?? null;
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

  private ensurePasswordChangeAllowed(user: User): void {
    if (!user.lastPasswordChangedAt) {
      return;
    }

    const now = Date.now();
    const lastChanged = new Date(user.lastPasswordChangedAt).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now - lastChanged < oneDayMs) {
      throw new HttpException(
        '비밀번호는 하루에 한 번만 변경할 수 있습니다.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async ensureRegularUserAccount(email: string): Promise<User> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      const socialLogin = await this.userService.findSocialLoginByEmail(email);
      if (socialLogin) {
        throw new BadRequestException('소셜 로그인으로 가입한 계정입니다.');
      }
      throw new BadRequestException('등록되지 않은 이메일입니다.');
    }

    if (!user.password) {
      throw new BadRequestException('소셜 로그인으로 가입한 계정입니다.');
    }

    return user;
  }

  private nullableString(value: string | null | undefined): string | null {
    return value ?? null;
  }

  private nullableNumber(value: number | null | undefined): number | null {
    return value ?? null;
  }

  async reRegister(reRegisterDto: ReRegisterDto): Promise<{ message: string }> {
    // soft delete된 사용자 조회
    const deletedUser = await this.userRepository.findOne({
      where: { email: reRegisterDto.email },
      withDeleted: true,
    });

    if (!deletedUser || !deletedUser.deletedAt) {
      throw new BadRequestException('재가입할 수 있는 계정이 없습니다.');
    }

    // 이메일 인증 완료 여부 확인 (목적: RE_REGISTER)
    const isEmailVerified = await this.emailVerificationService.isEmailVerified(
      reRegisterDto.email,
      EmailPurpose.RE_REGISTER,
    );

    if (!isEmailVerified) {
      throw new BadRequestException('이메일 인증이 완료되지 않았습니다.');
    }

    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(reRegisterDto.password, 10);

    // update() 메서드를 사용하여 전체 값 UPDATE
    await this.userRepository.update(
      { email: reRegisterDto.email },
      {
        password: hashedPassword,
        name: reRegisterDto.name,
        reRegisterEmailVerified: true,
        refreshToken: null,
        deletedAt: null,
        lastPasswordChangedAt: new Date(),
      },
    );

    // 이메일 인증 코드 만료 처리
    await this.emailVerificationService.expireVerification(
      reRegisterDto.email,
      EmailPurpose.RE_REGISTER,
    );

    // 업데이트된 사용자 조회
    const user = await this.userRepository.findOne({
      where: { email: reRegisterDto.email },
    });

    if (!user) {
      throw new BadRequestException('재가입 처리 중 오류가 발생했습니다.');
    }

    return { message: '재가입이 완료되었습니다. 로그인해주세요.' };
  }

  async reRegisterSocial(
    reRegisterSocialDto: ReRegisterSocialDto,
  ): Promise<{ message: string }> {
    // soft delete된 소셜 로그인 사용자 조회
    const deletedSocialLogin = await this.socialLoginRepository.findOne({
      where: { email: reRegisterSocialDto.email },
      withDeleted: true,
    });

    if (!deletedSocialLogin || !deletedSocialLogin.deletedAt) {
      throw new BadRequestException('재가입할 수 있는 계정이 없습니다.');
    }

    // User 테이블에 활성 사용자가 존재하는지 확인
    const activeUser = await this.userRepository.findOne({
      where: { email: reRegisterSocialDto.email },
    });

    if (activeUser) {
      throw new BadRequestException(
        '이미 일반 회원가입으로 가입한 이메일입니다.',
      );
    }

    // update() 메서드를 사용하여 deletedAt 해제 및 refreshToken 제거
    await this.socialLoginRepository.update(
      { email: reRegisterSocialDto.email },
      {
        refreshToken: null,
        deletedAt: null,
      },
    );

    // 업데이트된 소셜 로그인 사용자 조회
    const socialLogin = await this.socialLoginRepository.findOne({
      where: { email: reRegisterSocialDto.email },
    });

    if (!socialLogin) {
      throw new BadRequestException('재가입 처리 중 오류가 발생했습니다.');
    }

    return { message: '재가입이 완료되었습니다. 로그인해주세요.' };
  }
}
