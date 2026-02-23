import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AUTH_TIMING } from '@/common/constants/business.constants';
import { User } from '@/user/entities/user.entity';
import { UserModule } from '@/user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerification } from './entities/email-verification.entity';
import { JwtTokenProvider } from './provider/jwt-token.provider';
import { AuthSocialService } from './services/auth-social.service';
import { AuthTokenService } from './services/auth-token.service';
import { EmailNotificationService } from './services/email-notification.service';
import { EmailVerificationService } from './services/email-verification.service';
import { JwtStrategy } from './strategy/jwt.strategy';
import { LocalStrategy } from './strategy/local.strategy';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([User, EmailVerification]),
    PassportModule,
    UserModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: AUTH_TIMING.ACCESS_TOKEN_EXPIRES },
      }),
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('EMAIL_HOST'),
          port: config.get<number>('EMAIL_PORT', 587),
          secure: config.get<string>('EMAIL_SECURE') === 'true',
          auth: {
            user: config.get<string>('EMAIL_ADDRESS'),
            pass: config.get<string>('EMAIL_PASSWORD'),
          },
        },
        defaults: {
          from: `"PickEat" <${config.get<string>('EMAIL_ADDRESS')}>`,
        },
        template: {
          // process.cwd() is intentional: returns Node.js process root, not an env variable
          dir: join(
            process.cwd(),
            config.get('NODE_ENV') === 'production' ? 'dist' : 'src',
            'auth',
            'templates',
          ),
          adapter: new HandlebarsAdapter(),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokenService,
    AuthSocialService,
    JwtStrategy,
    LocalStrategy,
    JwtTokenProvider,
    EmailVerificationService,
    EmailNotificationService,
  ],
  exports: [JwtStrategy],
})
export class AuthModule {}
