import {
  BadRequestException,
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
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  AUTH_COOKIE,
  AUTH_TIMING,
} from '../common/constants/business.constants';
import { ErrorCode } from '../common/constants/error-codes';
import { MessageCode } from '../common/constants/message-codes';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import {
  AuthUserPayload,
  CurrentUser,
} from './decorators/current-user.decorator';
import { AppKakaoLoginDto } from './dto/app-kakao-login.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { ReRegisterSocialDto } from './dto/re-register-social.dto';
import { ReRegisterDto } from './dto/re-register.dto';
import { RedirectDto } from './dto/redirect.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailPurpose, SendEmailCodeDto } from './dto/send-email-code.dto';
import { SendResetPasswordCodeDto } from './dto/send-reset-password-code.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';
import { VerifyResetPasswordCodeDto } from './dto/verify-reset-password-code.dto';
import { JwtAuthGuard } from './guard/jwt.guard';
import { LocalAuthGuard } from './guard/local.guard';
import { AuthProfile, AuthResult } from './interfaces/auth.interface';
import { EmailVerificationService } from './services/email-verification.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('kakao/doLogin')
  async kakaoLogin(
    @Body() redirectDto: RedirectDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const language = this.extractLanguage(req);
    const result = await this.authService.kakaoLogin(
      redirectDto.code,
      language,
    );
    return this.handleAuthSuccess(res, result);
  }

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('kakao/appLogin')
  async kakaoAppLogin(
    @Body() appKakaoLoginDto: AppKakaoLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const language = this.extractLanguage(req);
    const result = await this.authService.kakaoLoginWithToken(
      appKakaoLoginDto.accessToken,
      language,
    );
    return this.handleAuthSuccess(res, result);
  }

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('google/doLogin')
  async googleLogin(
    @Body() redirectDto: RedirectDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    const language = this.extractLanguage(req);
    const result = await this.authService.googleLogin(
      redirectDto.code,
      language,
    );
    return this.handleAuthSuccess(res, result);
  }

  /** @public */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: Request) {
    const lang = this.extractLanguage(req);
    return this.authService.register(registerDto, lang);
  }

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @UseGuards(LocalAuthGuard)
  async login(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.buildAuthResult(user);
    return this.handleAuthSuccess(res, result);
  }

  /** @public */
  @Get('check-email')
  async checkEmail(@Query() checkEmailDto: CheckEmailDto) {
    return this.authService.checkEmail(checkEmailDto.email);
  }

  /** @public */
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('email/send-code')
  async sendEmailCode(
    @Body() sendEmailCodeDto: SendEmailCodeDto,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.emailVerificationService.sendCode(
      sendEmailCodeDto.email,
      sendEmailCodeDto.purpose,
      lang,
    );
    return { success: true, ...result };
  }

  /** @public */
  @Post('email/verify-code')
  async verifyEmailCode(@Body() verifyEmailCodeDto: VerifyEmailCodeDto) {
    const purpose = verifyEmailCodeDto.purpose ?? EmailPurpose.SIGNUP;

    // 재가입 목적인 경우 soft delete된 사용자 확인
    if (purpose === EmailPurpose.RE_REGISTER) {
      const deletedUser = await this.authService.findDeletedUserByEmail(
        verifyEmailCodeDto.email,
      );
      if (!deletedUser || !deletedUser.deletedAt) {
        throw new BadRequestException({
          errorCode: ErrorCode.AUTH_NO_REREGISTER_ACCOUNT,
        });
      }
    }

    await this.emailVerificationService.verifyCode(
      verifyEmailCodeDto.email,
      verifyEmailCodeDto.code,
      purpose,
    );

    // 회원가입 목적이고 사용자가 이미 존재하는 경우에만 emailVerified 업데이트
    if (purpose === EmailPurpose.SIGNUP) {
      const user = await this.userService.findByEmail(verifyEmailCodeDto.email);
      if (user) {
        await this.userService.markEmailVerified(verifyEmailCodeDto.email);
      }
    }

    return {
      success: true,
      messageCode: MessageCode.AUTH_EMAIL_VERIFICATION_COMPLETED,
    };
  }

  /** @public */
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('password/reset/send-code')
  async sendResetPasswordCode(
    @Body() sendResetPasswordCodeDto: SendResetPasswordCodeDto,
    @Req() req: Request,
  ) {
    const lang = this.extractLanguage(req);
    const result = await this.authService.sendResetPasswordCode(
      sendResetPasswordCodeDto.email,
      lang,
    );
    return { success: true, ...result };
  }

  /** @public */
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

  /** @public */
  @Post('password/reset')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    await this.authService.resetPassword(resetPasswordDto);
    return {
      success: true,
      messageCode: MessageCode.AUTH_PASSWORD_RESET_COMPLETED,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser() user: AuthUserPayload): Promise<AuthProfile> {
    return this.authService.getUserProfile(user.email);
  }

  /** @public */
  @Post('refresh')
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[AUTH_COOKIE.REFRESH_TOKEN_NAME];
    if (!refreshToken) {
      throw new UnauthorizedException(
        ErrorCode.AUTH_REFRESH_TOKEN_COOKIE_MISSING,
      );
    }
    const tokens = await this.authService.refreshAccessToken(refreshToken);
    this.setRefreshTokenCookie(res, tokens.refreshToken);
    return { token: tokens.token };
  }

  /** @public */
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(
      req.cookies?.[AUTH_COOKIE.REFRESH_TOKEN_NAME],
    );
    this.clearRefreshTokenCookie(res);
    return {
      messageCode: MessageCode.AUTH_LOGOUT_COMPLETED,
    };
  }

  /** @public */
  @Post('re-register')
  async reRegister(@Body() reRegisterDto: ReRegisterDto) {
    return this.authService.reRegister(reRegisterDto);
  }

  /** @public */
  @Post('re-register/social')
  async reRegisterSocial(@Body() reRegisterSocialDto: ReRegisterSocialDto) {
    return this.authService.reRegisterSocial(reRegisterSocialDto);
  }

  private handleAuthSuccess(res: Response, result: AuthResult) {
    this.setRefreshTokenCookie(res, result.refreshToken);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { refreshToken, ...payload } = result;
    return payload;
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    res.cookie(AUTH_COOKIE.REFRESH_TOKEN_NAME, refreshToken, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: AUTH_TIMING.COOKIE_MAX_AGE_MS,
    });
  }

  private clearRefreshTokenCookie(res: Response) {
    res.clearCookie(AUTH_COOKIE.REFRESH_TOKEN_NAME, {
      httpOnly: true,
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: '/',
    });
  }

  private extractLanguage(req: Request): 'ko' | 'en' | undefined {
    const acceptLanguage = req.headers['accept-language'];

    // Input validation
    if (!acceptLanguage || typeof acceptLanguage !== 'string') {
      return undefined;
    }

    // Length limit (DoS prevention)
    if (acceptLanguage.length > 100) {
      return undefined;
    }

    // Extract language code
    const primaryLanguage = acceptLanguage.split(',')[0]?.split('-')[0]?.trim();

    // Allow only supported languages
    if (primaryLanguage === 'en') {
      return 'en';
    }
    if (primaryLanguage === 'ko') {
      return 'ko';
    }
    return undefined;
  }
}
