import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialLogin } from 'src/user/entities/social-login.entity';
import { User } from 'src/user/entities/user.entity';
import { UserModule } from 'src/user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenProvider } from './provider/jwt-token.provider';
import { JwtStrategy } from './strategy/jwt.strategy';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([User, SocialLogin]),
    PassportModule,
    UserModule,
    JwtModule.register({
      secret: 'secret',
      signOptions: { expiresIn: '30s' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtTokenProvider],
  exports: [JwtStrategy],
})
export class AuthModule {}
