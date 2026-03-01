import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ErrorCode } from '@/common/constants/error-codes';
import { MessageCode } from '@/common/constants/message-codes';
import { User } from '@/user/entities/user.entity';
import { UserService } from '@/user/user.service';
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
    private readonly jwtService: JwtService,
  ) {}

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('kakao/doLogin')
  async kakaoLogin(@Body() redirectDto: RedirectDto, @Req() req: Request) {
    const language = this.extractLanguage(req);
    const result = await this.authService.kakaoLogin(
      redirectDto.code,
      language,
    );
    return this.handleAuthSuccess(result);
  }

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('kakao/appLogin')
  async kakaoAppLogin(
    @Body() appKakaoLoginDto: AppKakaoLoginDto,
    @Req() req: Request,
  ) {
    const language = this.extractLanguage(req);
    const result = await this.authService.kakaoLoginWithToken(
      appKakaoLoginDto.accessToken,
      language,
    );
    return this.handleAuthSuccess(result);
  }

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('google/doLogin')
  async googleLogin(@Body() redirectDto: RedirectDto, @Req() req: Request) {
    const language = this.extractLanguage(req);
    const result = await this.authService.googleLogin(
      redirectDto.code,
      language,
    );
    return this.handleAuthSuccess(result);
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
  async login(@Req() req: Request) {
    const user = (req as Request & { user: User }).user;
    if (!user?.id) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
      });
    }
    const result = await this.authService.buildAuthResult(user);
    return this.handleAuthSuccess(result);
  }

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Req() req: Request) {
    const authHeader = req.headers.authorization;
    const expiredToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!expiredToken) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_MISSING_ACCESS_TOKEN,
      });
    }
    return this.authService.refreshAccessToken(expiredToken);
  }

  /** @public */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;
    if (!token) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_MISSING_ACCESS_TOKEN,
      });
    }

    const accessTokenSecret =
      this.configService.getOrThrow<string>('JWT_SECRET');
    let payload: { sub: number };
    try {
      payload = this.jwtService.verify(token, {
        secret: accessTokenSecret,
        ignoreExpiration: true,
      });
    } catch {
      throw new UnauthorizedException({
        errorCode: ErrorCode.AUTH_MISSING_ACCESS_TOKEN,
      });
    }

    await this.authService.logout(payload.sub);
    return { messageCode: MessageCode.AUTH_LOGOUT_COMPLETED };
  }

  /** @public */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('re-register')
  async reRegister(@Body() reRegisterDto: ReRegisterDto) {
    return this.authService.reRegister(reRegisterDto);
  }

  /** @public */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('re-register/social')
  async reRegisterSocial(@Body() reRegisterSocialDto: ReRegisterSocialDto) {
    return this.authService.reRegisterSocial(reRegisterSocialDto);
  }

  private handleAuthSuccess(result: AuthResult) {
    return result;
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
