// src/auth/auth.service.ts
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { SocialType } from '../user/enum/social-type.enum';
import { UserService } from '../user/user.service';
import { AccessTokenDto } from './dto/access-token.dto';
import { KakaoProfileDto } from './dto/kakao-profile.dto';
import { JwtTokenProvider } from './provider/jwt-token.provider';

@Injectable()
export class AuthService {
  private readonly kakaoClientIdEnv = "b82967657cb741bb3c4173fdfe1dc0b7";
  private readonly kakaoRedirectUriEnv = "http://localhost:8080/oauth/kakao/redirect";

  constructor(
    private readonly httpService: HttpService,
    private readonly userService: UserService,
    private readonly jwtTokenProvider: JwtTokenProvider,
  ) {}

  async kakaoLogin(code: string) {
    // 1) 인가코드로 액세스 토큰 발급
    const accessTokenDto = await this.getKakaoAccessToken(code);

    // 2) 토큰으로 카카오 프로필 조회
    const kakaoProfileDto = await this.getKakaoProfile(
      accessTokenDto.access_token,
    );
    return this.processKakaoProfile(kakaoProfileDto);
  }

  async kakaoLoginWithToken(accessToken: string) {
    const kakaoProfileDto = await this.getKakaoProfile(accessToken);
    return this.processKakaoProfile(kakaoProfileDto);
  }

  private async getKakaoAccessToken(code: string): Promise<AccessTokenDto> {
    const clientId = this.kakaoClientIdEnv;
    const redirectUri = this.kakaoRedirectUriEnv;
    if (!clientId || !redirectUri) {
      throw new Error('Kakao OAuth env missing: OAUTH_KAKAO_CLIENT_ID or OAUTH_KAKAO_REDIRECT_URI');
    }
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');

    const response = (await firstValueFrom(
      this.httpService.post<AccessTokenDto>(
        'https://kauth.kakao.com/oauth/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      ),
    )) as AxiosResponse<AccessTokenDto>;

    console.log('응답 accesstoken JSON', response.data);
    return response.data;
  }

  private async getKakaoProfile(token: string): Promise<KakaoProfileDto> {
    const response = (await firstValueFrom(
      this.httpService.get<KakaoProfileDto>(
        'https://kapi.kakao.com/v2/user/me',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      ),
    )) as AxiosResponse<KakaoProfileDto>;

    console.log('profile JSON', response.data);
    return response.data;
  }

  private async processKakaoProfile(kakaoProfileDto: KakaoProfileDto) {
    let originalUser = await this.userService.getUserBySocialId(
      kakaoProfileDto.id,
    );

    if (!originalUser) {
      const email = kakaoProfileDto.kakao_account.email;
      if (!email) {
        throw new Error('Kakao profile does not include email. Enable email scope.');
      }
      const profileImage = kakaoProfileDto.properties?.profile_image;
      originalUser = await this.userService.createOauth(
        kakaoProfileDto.id,
        email,
        SocialType.KAKAO,
        profileImage,
      );
    }

    const jwtToken = this.jwtTokenProvider.createToken(
      originalUser.email,
      originalUser.role.toString(),
    );

    return {
      id: originalUser.id,
      token: jwtToken,
    };
  }
}
