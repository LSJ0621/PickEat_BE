import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialLogin } from './entities/social-login.entity';
import { UserAddress } from './entities/user-address.entity';
import { User } from './entities/user.entity';
import { PreferenceUpdateAiService } from './preference-update-ai.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, SocialLogin, UserAddress])],
  controllers: [UserController],
  providers: [UserService, PreferenceUpdateAiService],
  exports: [UserService, PreferenceUpdateAiService, TypeOrmModule],
})
export class UserModule {}
