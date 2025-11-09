import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppKakaoLoginDto } from './dto/app-kakao-login.dto';
import { RedirectDto } from './dto/redirect.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('kakao/doLogin')
  async kakaoLogin(@Body() redirectDto: RedirectDto) {
    return this.authService.kakaoLogin(redirectDto.code);
  }

  @Post('kakao/appLogin')
  async kakaoAppLogin(@Body() appKakaoLoginDto: AppKakaoLoginDto) {
    return this.authService.kakaoLoginWithToken(appKakaoLoginDto.accessToken);
  }
}
