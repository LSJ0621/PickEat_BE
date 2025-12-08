import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalModule } from 'src/external/external.module';
import { SocialLogin } from './entities/social-login.entity';
import { UserAddress } from './entities/user-address.entity';
import { User } from './entities/user.entity';
import { PreferenceUpdateAiService } from './preference-update-ai.service';
import { AddressSearchService } from './services/address-search.service';
import { UserAddressService } from './services/user-address.service';
import { UserPreferenceService } from './services/user-preference.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SocialLogin, UserAddress]),
    ExternalModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    UserAddressService,
    UserPreferenceService,
    AddressSearchService,
    PreferenceUpdateAiService,
  ],
  exports: [
    UserService,
    UserAddressService,
    UserPreferenceService,
    PreferenceUpdateAiService,
    TypeOrmModule,
  ],
})
export class UserModule {}
