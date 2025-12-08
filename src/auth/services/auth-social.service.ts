import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleOAuthClient } from '../../external/google/clients/google-oauth.client';
import { KakaoOAuthClient } from '../../external/kakao/clients/kakao-oauth.client';
import { SocialLogin } from '../../user/entities/social-login.entity';
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
    @InjectRepository(SocialLogin)
    private readonly socialLoginRepository: Repository<SocialLogin>,
    private readonly kakaoOAuthClient: KakaoOAuthClient,
    private readonly googleOAuthClient: GoogleOAuthClient,
  ) {}

  // ========== Kakao OAuth ==========

  async kakaoLogin(
    code: string,
    buildAuthResult: (entity: User | SocialLogin) => Promise<AuthResult>,
  ): Promise<AuthResult> {
    const accessTokenDto = await this.getKakaoAccessToken(code);
    const kakaoProfileDto = await this.getKakaoProfile(accessTokenDto.access_token);
    return this.processKakaoProfile(kakaoProfileDto, buildAuthResult);
  }

  async kakaoLoginWithToken(
    accessToken: string,
    buildAuthResult: (entity: User | SocialLogin) => Promise<AuthResult>,
  ): Promise<AuthResult> {
    const kakaoProfileDto = await this.getKakaoProfile(accessToken);
    return this.processKakaoProfile(kakaoProfileDto, buildAuthResult);
  }

  private async getKakaoAccessToken(code: string): Promise<{ access_token: string }> {
    const tokenResponse = await this.kakaoOAuthClient.getAccessToken(code);
    return { access_token: tokenResponse.access_token };
  }

  private async getKakaoProfile(token: string): Promise<KakaoProfileDto> {
    const profile = await this.kakaoOAuthClient.getUserProfile(token);
    return profile as unknown as KakaoProfileDto;
  }

  private async processKakaoProfile(
    kakaoProfileDto: KakaoProfileDto,
    buildAuthResult: (entity: User | SocialLogin) => Promise<AuthResult>,
  ): Promise<AuthResult> {
    const email = kakaoProfileDto.kakao_account.email;
    if (!email) {
      throw new BadRequestException(
        '카카오 프로필에 이메일이 포함되어 있지 않습니다. 이메일 권한을 허용해주세요.',
      );
    }

    const activeUser = await this.userRepository.findOne({ where: { email } });
    if (activeUser) {
      throw new BadRequestException('이미 일반 회원가입으로 가입한 이메일입니다.');
    }

    let originalUser = await this.userService.getUserBySocialId(kakaoProfileDto.id);

    if (!originalUser) {
      const profileImage = kakaoProfileDto.properties?.profile_image;
      originalUser = await this.userService.createOauth(
        kakaoProfileDto.id,
        email,
        SocialType.KAKAO,
        profileImage,
      );
    } else if (originalUser.deletedAt) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: '탈퇴한 이력이 있습니다. 재가입하시겠습니까?',
          error: 'RE_REGISTER_REQUIRED',
          email: email,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return buildAuthResult(originalUser);
  }

  // ========== Google OAuth ==========

  async googleLogin(
    code: string,
    buildAuthResult: (entity: User | SocialLogin) => Promise<AuthResult>,
  ): Promise<AuthResult> {
    const accessTokenDto = await this.getGoogleAccessToken(code);
    const googleProfileDto = await this.getGoogleProfile(accessTokenDto.access_token);
    return this.processGoogleProfile(googleProfileDto, buildAuthResult);
  }

  private async getGoogleAccessToken(code: string): Promise<{ access_token: string }> {
    const tokenResponse = await this.googleOAuthClient.getAccessToken(code);
    return { access_token: tokenResponse.access_token };
  }

  private async getGoogleProfile(token: string): Promise<GoogleProfileDto> {
    const profile = await this.googleOAuthClient.getUserProfile(token);
    return profile as unknown as GoogleProfileDto;
  }

  private async processGoogleProfile(
    googleProfileDto: GoogleProfileDto,
    buildAuthResult: (entity: User | SocialLogin) => Promise<AuthResult>,
  ): Promise<AuthResult> {
    const email = googleProfileDto.email;
    if (!email) {
      throw new BadRequestException(
        '구글 프로필에 이메일이 포함되어 있지 않습니다. 이메일 권한을 허용해주세요.',
      );
    }

    const activeUser = await this.userRepository.findOne({ where: { email } });
    if (activeUser) {
      throw new BadRequestException('이미 일반 회원가입으로 가입한 이메일입니다.');
    }

    let originalUser = await this.userService.getUserBySocialId(googleProfileDto.sub);

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
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: '탈퇴한 이력이 있습니다. 재가입하시겠습니까?',
          error: 'RE_REGISTER_REQUIRED',
          email: email,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return buildAuthResult(originalUser);
  }

  // ========== Re-register Social ==========

  async reRegisterSocial(reRegisterSocialDto: ReRegisterSocialDto): Promise<{ message: string }> {
    const deletedSocialLogin = await this.socialLoginRepository.findOne({
      where: { email: reRegisterSocialDto.email },
      withDeleted: true,
    });

    if (!deletedSocialLogin || !deletedSocialLogin.deletedAt) {
      throw new BadRequestException('재가입할 수 있는 계정이 없습니다.');
    }

    const activeUser = await this.userRepository.findOne({
      where: { email: reRegisterSocialDto.email },
    });

    if (activeUser) {
      throw new BadRequestException('이미 일반 회원가입으로 가입한 이메일입니다.');
    }

    await this.socialLoginRepository.update(
      { email: reRegisterSocialDto.email },
      { refreshToken: null, deletedAt: null },
    );

    const socialLogin = await this.socialLoginRepository.findOne({
      where: { email: reRegisterSocialDto.email },
    });

    if (!socialLogin) {
      throw new BadRequestException('재가입 처리 중 오류가 발생했습니다.');
    }

    return { message: '재가입이 완료되었습니다. 로그인해주세요.' };
  }
}

