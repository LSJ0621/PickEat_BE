import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { UserModule } from 'src/user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenProvider } from './provider/jwt-token.provider';
import { JwtStrategy } from './strategy/jwt.strategy';
import { LocalStrategy } from './strategy/local.strategy';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([User]),
    PassportModule,
    UserModule,
    JwtModule.register({
      secret: 'secret',               
      signOptions: { expiresIn: '1h' }
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, JwtTokenProvider],
  exports: [JwtStrategy],
})
export class AuthModule {}
