import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { SocialLogin } from 'src/user/entities/social-login.entity';
import { User } from 'src/user/entities/user.entity';
import { UserModule } from 'src/user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerification } from './entities/email-verification.entity';
import { JwtTokenProvider } from './provider/jwt-token.provider';
import { EmailVerificationService } from './services/email-verification.service';
import { JwtStrategy } from './strategy/jwt.strategy';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([User, SocialLogin, EmailVerification]),
    PassportModule,
    UserModule,
    JwtModule.register({
      secret: 'secret',
      // access token 만료 시간: 15분
      signOptions: { expiresIn: '15m' },
    }),
    MailerModule.forRoot({
      transport: {
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_ADDRESS,
          pass: process.env.EMAIL_PASSWORD,
        },
      },
      defaults: {
        from: `"PickEat" <${process.env.EMAIL_ADDRESS}>`,
      },
      template: {
        dir: join(process.cwd(), 'src', 'auth', 'templates'),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtTokenProvider, EmailVerificationService],
  exports: [JwtStrategy],
})
export class AuthModule {}
