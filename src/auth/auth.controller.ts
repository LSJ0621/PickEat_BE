import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppKakaoLoginDto } from './dto/app-kakao-login.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { LoginDto } from './dto/login.dto';
import { RedirectDto } from './dto/redirect.dto';
import { RegisterDto } from './dto/register.dto';

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

  @Post('google/doLogin')
  async googleLogin(@Body() redirectDto: RedirectDto) {
    console.log('=== 프론트엔드 구글 로그인 요청 ===');
    console.log('받은 요청 본문:', JSON.stringify(redirectDto));
    console.log('인가코드:', redirectDto.code);
    return this.authService.googleLogin(redirectDto.code);
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('check-email')
  async checkEmail(@Query() checkEmailDto: CheckEmailDto) {
    return this.authService.checkEmail(checkEmailDto.email);
  }
}
