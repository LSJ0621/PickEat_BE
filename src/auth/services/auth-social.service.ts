import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { ErrorCode } from '../../common/constants/error-codes';
import { MessageCode } from '../../common/constants/message-codes';
import { GoogleOAuthClient } from '../../external/google/clients/google-oauth.client';
import { KakaoOAuthClient } from '../../external/kakao/clients/kakao-oauth.client';
import { User } from '../../user/entities/user.entity';
import { SocialType } from '../../user/enum/social-type.enum';
import { UserService } from '../../user/user.service';
import { GoogleProfileDto } from '../dto/google-profile.dto';
import { KakaoProfileDto } from '../dto/kakao-profile.dto';
import { ReRegisterSocialDto } from '../dto/re-register-social.dto';
import { AuthResult } from '../interfaces/auth.interface';

@Injectable()
export class AuthSocialService {
  private readonly logger = new Logger(AuthSocialService.name);

  constructor(
    private readonly userService: UserService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly kakaoOAuthClient: KakaoOAuthClient,
    private readonly googleOAuthClient: GoogleOAuthClient,
  ) {}

  // ========== Kakao OAuth ==========

  async kakaoLogin(
    code: string,
    buildAuthResult: (entity: User) => Promise<AuthResult>,
    language?: 'ko' | 'en',
  ): Promise<AuthResult> {
    const accessTokenDto = await this.getKakaoAccessToken(code);
    const kakaoProfileDto = await this.getKakaoProfile(
      accessTokenDto.access_token,
    );
    return this.processKakaoProfile(kakaoProfileDto, buildAuthResult, language);
  }

  async kakaoLoginWithToken(
    accessToken: string,
    buildAuthResult: (entity: User) => Promise<AuthResult>,
    language?: 'ko' | 'en',
  ): Promise<AuthResult> {
    const kakaoProfileDto = await this.getKakaoProfile(accessToken);
    return this.processKakaoProfile(kakaoProfileDto, buildAuthResult, language);
  }

  private async getKakaoAccessToken(
    code: string,
  ): Promise<{ access_token: string }> {
    const tokenResponse = await this.kakaoOAuthClient.getAccessToken(code);
    return { access_token: tokenResponse.access_token };
  }

  private async getKakaoProfile(token: string): Promise<KakaoProfileDto> {
    const profile = await this.kakaoOAuthClient.getUserProfile(token);
    return profile as unknown as KakaoProfileDto;
  }

  private async processKakaoProfile(
    kakaoProfileDto: KakaoProfileDto,
    buildAuthResult: (entity: User) => Promise<AuthResult>,
    language?: 'ko' | 'en',
  ): Promise<AuthResult> {
    const email = kakaoProfileDto.kakao_account.email;
    if (!email) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_EMAIL_NOT_REGISTERED,
      });
    }

    const activeUser = await this.userRepository.findOne({
      where: { email, password: Not(IsNull()) },
    });
    if (activeUser) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
      });
    }

    let user = await this.userService.getUserBySocialId(kakaoProfileDto.id);

    if (!user) {
      user = await this.userService.createOauth(
        kakaoProfileDto.id,
        email,
        SocialType.KAKAO,
        undefined,
        language,
      );
    } else if (user.deletedAt) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'RE_REGISTER_REQUIRED',
          email: email,
        },
        HttpStatus.BAD_REQUEST,
      );
    } else if (user.isDeactivated) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: 'USER_DEACTIVATED',
          errorCode: ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return buildAuthResult(user);
  }

  // ========== Google OAuth ==========

  async googleLogin(
    code: string,
    buildAuthResult: (entity: User) => Promise<AuthResult>,
    language?: 'ko' | 'en',
  ): Promise<AuthResult> {
    const accessTokenDto = await this.getGoogleAccessToken(code);
    const googleProfileDto = await this.getGoogleProfile(
      accessTokenDto.access_token,
    );
    return this.processGoogleProfile(
      googleProfileDto,
      buildAuthResult,
      language,
    );
  }

  private async getGoogleAccessToken(
    code: string,
  ): Promise<{ access_token: string }> {
    const tokenResponse = await this.googleOAuthClient.getAccessToken(code);
    return { access_token: tokenResponse.access_token };
  }

  private async getGoogleProfile(token: string): Promise<GoogleProfileDto> {
    const profile = await this.googleOAuthClient.getUserProfile(token);
    return profile as unknown as GoogleProfileDto;
  }

  private async processGoogleProfile(
    googleProfileDto: GoogleProfileDto,
    buildAuthResult: (entity: User) => Promise<AuthResult>,
    language?: 'ko' | 'en',
  ): Promise<AuthResult> {
    const email = googleProfileDto.email;
    if (!email) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_EMAIL_NOT_REGISTERED,
      });
    }

    const activeUser = await this.userRepository.findOne({
      where: { email, password: Not(IsNull()) },
    });
    if (activeUser) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
      });
    }

    let user = await this.userService.getUserBySocialId(googleProfileDto.sub);

    if (!user) {
      const name = googleProfileDto.name;
      user = await this.userService.createOauth(
        googleProfileDto.sub,
        email,
        SocialType.GOOGLE,
        name,
        language,
      );
    } else if (user.deletedAt) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'RE_REGISTER_REQUIRED',
          email: email,
        },
        HttpStatus.BAD_REQUEST,
      );
    } else if (user.isDeactivated) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: 'USER_DEACTIVATED',
          errorCode: ErrorCode.AUTH_ACCOUNT_DEACTIVATED,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return buildAuthResult(user);
  }

  // ========== Re-register Social ==========

  async reRegisterSocial(
    reRegisterSocialDto: ReRegisterSocialDto,
  ): Promise<{ messageCode: MessageCode }> {
    const deletedUser = await this.userRepository.findOne({
      where: { email: reRegisterSocialDto.email, socialId: Not(IsNull()) },
      withDeleted: true,
    });

    if (!deletedUser || !deletedUser.deletedAt) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_NO_REREGISTER_ACCOUNT,
      });
    }

    const activeRegularUser = await this.userRepository.findOne({
      where: { email: reRegisterSocialDto.email, password: Not(IsNull()) },
    });

    if (activeRegularUser) {
      throw new BadRequestException({
        message: '이미 일반 회원가입으로 가입한 이메일입니다.',
        errorCode: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
      });
    }

    await this.userRepository.update(
      { email: reRegisterSocialDto.email },
      { refreshToken: null, deletedAt: null },
    );

    const user = await this.userRepository.findOne({
      where: { email: reRegisterSocialDto.email },
    });

    if (!user) {
      throw new BadRequestException({
        errorCode: ErrorCode.AUTH_RE_REGISTER_ERROR,
      });
    }

    return {
      messageCode: MessageCode.AUTH_RE_REGISTRATION_COMPLETED,
    };
  }
}
