import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { AuthProfile, AuthResult, AuthService } from './auth.service';
import {
  AuthUserPayload,
  CurrentUser,
} from './decorators/current-user.decorator';
import { AppKakaoLoginDto } from './dto/app-kakao-login.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { LoginDto } from './dto/login.dto';
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
import { EmailVerificationService } from './services/email-verification.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly userService: UserService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Post('kakao/doLogin')
  async kakaoLogin(
    @Body() redirectDto: RedirectDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.kakaoLogin(redirectDto.code);
      return this.handleAuthSuccess(res, result);
    } catch (error: any) {
      const errorResponse = error.getResponse
        ? error.getResponse()
        : error.response || error;
      if (errorResponse?.error === 'RE_REGISTER_REQUIRED') {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'RE_REGISTER_REQUIRED',
          message: errorResponse.message,
          email: errorResponse.email, // 이메일 포함하여 반환
        };
      }
      throw error;
    }
  }

  @Post('kakao/appLogin')
  async kakaoAppLogin(
    @Body() appKakaoLoginDto: AppKakaoLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.kakaoLoginWithToken(
        appKakaoLoginDto.accessToken,
      );
      return this.handleAuthSuccess(res, result);
    } catch (error: any) {
      const errorResponse = error.getResponse
        ? error.getResponse()
        : error.response || error;
      if (errorResponse?.error === 'RE_REGISTER_REQUIRED') {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'RE_REGISTER_REQUIRED',
          message: errorResponse.message,
          email: errorResponse.email, // 이메일 포함하여 반환
        };
      }
      throw error;
    }
  }

  @Post('google/doLogin')
  async googleLogin(
    @Body() redirectDto: RedirectDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.googleLogin(redirectDto.code);
      return this.handleAuthSuccess(res, result);
    } catch (error: any) {
      const errorResponse = error.getResponse
        ? error.getResponse()
        : error.response || error;
      if (errorResponse?.error === 'RE_REGISTER_REQUIRED') {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'RE_REGISTER_REQUIRED',
          message: errorResponse.message,
          email: errorResponse.email, // 이메일 포함하여 반환
        };
      }
      throw error;
    }
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
    try {
      const result = await this.emailVerificationService.sendCode(
        sendEmailCodeDto.email,
        sendEmailCodeDto.purpose,
      );
      return { success: true, ...result };
    } catch (error: any) {
      // BadRequestException의 경우 메시지를 명시적으로 추출하여 반환
      if (error instanceof BadRequestException) {
        const errorResponse = error.getResponse();
        let message: string;

        if (typeof errorResponse === 'string') {
          message = errorResponse;
        } else if (errorResponse && typeof errorResponse === 'object') {
          message =
            (errorResponse as any).message ||
            '인증번호 발송 중 오류가 발생했습니다.';
        } else {
          message = error.message || '인증번호 발송 중 오류가 발생했습니다.';
        }

        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: message,
          error: 'Bad Request',
        });
      }
      // 기타 에러의 경우 일반적인 메시지와 함께 throw
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: error.message || '인증번호 발송 중 오류가 발생했습니다.',
        error: 'Bad Request',
      });
    }
  }

  @Post('email/verify-code')
  async verifyEmailCode(@Body() verifyEmailCodeDto: VerifyEmailCodeDto) {
    const purpose = verifyEmailCodeDto.purpose ?? EmailPurpose.SIGNUP;

    try {
      // 재가입 목적인 경우 soft delete된 사용자 확인
      if (purpose === EmailPurpose.RE_REGISTER) {
        const deletedUser = await this.userRepository.findOne({
          where: { email: verifyEmailCodeDto.email },
          withDeleted: true,
        });
        if (!deletedUser || !deletedUser.deletedAt) {
          throw new BadRequestException('재가입할 수 있는 계정이 없습니다.');
        }
      }

      const verified = await this.emailVerificationService.verifyCode(
        verifyEmailCodeDto.email,
        verifyEmailCodeDto.code,
        purpose,
      );

      // 회원가입 목적이고 사용자가 이미 존재하는 경우에만 emailVerified 업데이트
      if (verified && purpose === EmailPurpose.SIGNUP) {
        const user = await this.userService.findByEmail(
          verifyEmailCodeDto.email,
        );
        if (user) {
          await this.userService.markEmailVerified(verifyEmailCodeDto.email);
        }
      }

      // 재가입 목적인 경우 soft delete된 사용자의 reRegisterEmailVerified 업데이트
      if (verified && purpose === EmailPurpose.RE_REGISTER) {
        // 재가입 목적의 경우 인증만 완료 처리 (reRegisterEmailVerified는 재가입 API에서 처리)
      }

      return { success: true, message: '이메일 인증이 완료되었습니다.' };
    } catch (error: any) {
      // BadRequestException의 경우 메시지를 명시적으로 추출하여 반환
      if (error instanceof BadRequestException) {
        const errorResponse = error.getResponse();
        let message: string;

        if (typeof errorResponse === 'string') {
          message = errorResponse;
        } else if (errorResponse && typeof errorResponse === 'object') {
          message =
            (errorResponse as any).message ||
            '이메일 인증 중 오류가 발생했습니다.';
        } else {
          message = error.message || '이메일 인증 중 오류가 발생했습니다.';
        }

        // 명시적으로 메시지가 포함된 BadRequestException throw
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: message,
          error: 'Bad Request',
        });
      }
      // 기타 에러의 경우 일반적인 메시지와 함께 throw
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: error.message || '이메일 인증 중 오류가 발생했습니다.',
        error: 'Bad Request',
      });
    }
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
  async getProfile(@CurrentUser() user: AuthUserPayload): Promise<AuthProfile> {
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
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.cookies?.refreshToken);
    this.clearRefreshTokenCookie(res);
    return { message: '로그아웃되었습니다.' };
  }

  @Post('re-register')
  async reRegister(@Body() reRegisterDto: ReRegisterDto) {
    return this.authService.reRegister(reRegisterDto);
  }

  @Post('re-register/social')
  async reRegisterSocial(@Body() reRegisterSocialDto: ReRegisterSocialDto) {
    return this.authService.reRegisterSocial(reRegisterSocialDto);
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
