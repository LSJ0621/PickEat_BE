import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthProfile, AuthResult, AuthService } from './auth.service';
import { AuthUserPayload, CurrentUser } from './decorators/current-user.decorator';
import { AppKakaoLoginDto } from './dto/app-kakao-login.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { LoginDto } from './dto/login.dto';
import { RedirectDto } from './dto/redirect.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailPurpose, SendEmailCodeDto } from './dto/send-email-code.dto';
import { SendResetPasswordCodeDto } from './dto/send-reset-password-code.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { VerifyResetPasswordCodeDto } from './dto/verify-reset-password-code.dto';
import { JwtAuthGuard } from './guard/jwt.guard';
import { EmailVerificationService } from './services/email-verification.service';
import { UserService } from '../user/user.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly userService: UserService,
  ) {}

  @Post('kakao/doLogin')
  async kakaoLogin(
    @Body() redirectDto: RedirectDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.kakaoLogin(redirectDto.code);
    return this.handleAuthSuccess(res, result);
  }

  @Post('kakao/appLogin')
  async kakaoAppLogin(
    @Body() appKakaoLoginDto: AppKakaoLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.kakaoLoginWithToken(
      appKakaoLoginDto.accessToken,
    );
    return this.handleAuthSuccess(res, result);
  }

  @Post('google/doLogin')
  async googleLogin(
    @Body() redirectDto: RedirectDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    console.log('=== 프론트엔드 구글 로그인 요청 ===');
    console.log('받은 요청 본문:', JSON.stringify(redirectDto));
    console.log('인가코드:', redirectDto.code);
    const result = await this.authService.googleLogin(redirectDto.code);
    return this.handleAuthSuccess(res, result);
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    return this.handleAuthSuccess(res, result);
  }

  @Get('check-email')
  async checkEmail(@Query() checkEmailDto: CheckEmailDto) {
    return this.authService.checkEmail(checkEmailDto.email);
  }

  @Post('email/send-code')
  async sendEmailCode(@Body() sendEmailCodeDto: SendEmailCodeDto) {
    const result = await this.emailVerificationService.sendCode(
      sendEmailCodeDto.email,
      sendEmailCodeDto.purpose,
    );
    return { success: true, ...result };
  }

  @Post('email/verify-code')
  async verifyEmailCode(@Body() verifyEmailCodeDto: VerifyEmailCodeDto) {
    const purpose = verifyEmailCodeDto.purpose ?? EmailPurpose.SIGNUP;
    const verified = await this.emailVerificationService.verifyCode(
      verifyEmailCodeDto.email,
      verifyEmailCodeDto.code,
      purpose,
    );

    // 회원가입 목적이고 사용자가 이미 존재하는 경우에만 emailVerified 업데이트
    if (verified && purpose === EmailPurpose.SIGNUP) {
      const user = await this.userService.findByEmail(verifyEmailCodeDto.email);
      if (user) {
        await this.userService.markEmailVerified(verifyEmailCodeDto.email);
      }
    }

    return { success: true };
  }

  @Post('password/reset/send-code')
  async sendResetPasswordCode(
    @Body() sendResetPasswordCodeDto: SendResetPasswordCodeDto,
  ) {
    const result = await this.authService.sendResetPasswordCode(
      sendResetPasswordCodeDto.email,
    );
    return { success: true, ...result };
  }

  @Post('password/reset/verify-code')
  async verifyResetPasswordCode(
    @Body() verifyResetPasswordCodeDto: VerifyResetPasswordCodeDto,
  ) {
    await this.authService.verifyResetPasswordCode(
      verifyResetPasswordCodeDto.email,
      verifyResetPasswordCodeDto.code,
    );
    return { success: true };
  }

  @Post('password/reset')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.authService.resetPassword(resetPasswordDto);
    return {
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다.',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(
    @CurrentUser() user: AuthUserPayload,
  ): Promise<AuthProfile> {
    return this.authService.getUserProfile(user.email);
  }

  @Post('refresh')
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token cookie is missing.');
    }
    const tokens = await this.authService.refreshAccessToken(refreshToken);
    this.setRefreshTokenCookie(res, tokens.refreshToken);
    return { token: tokens.token };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.cookies?.refreshToken);
    this.clearRefreshTokenCookie(res);
    return { message: '로그아웃되었습니다.' };
  }

  private handleAuthSuccess(res: Response, result: AuthResult) {
    this.setRefreshTokenCookie(res, result.refreshToken);
    const { refreshToken, ...payload } = result;
    return payload;
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
    });
  }
}
