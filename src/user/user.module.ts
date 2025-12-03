import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialLogin } from './entities/social-login.entity';
import { User } from './entities/user.entity';
import { UserController } from './user.controller';
import { PreferenceUpdateAiService } from './preference-update-ai.service';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, SocialLogin])],
  controllers: [UserController],
  providers: [UserService, PreferenceUpdateAiService],
  exports: [UserService, PreferenceUpdateAiService, TypeOrmModule],
})
export class UserModule {}
