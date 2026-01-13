import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminInitializerService } from './services/admin-initializer.service';
import { TestUserSeederService } from './services/test-user-seeder.service';
import { UserAddress } from './entities/user-address.entity';
import { User } from './entities/user.entity';
import { PreferenceUpdateAiService } from './preference-update-ai.service';
import { AddressSearchService } from './services/address-search.service';
import { UserAddressService } from './services/user-address.service';
import { UserPreferenceService } from './services/user-preference.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserAddress])],
  controllers: [UserController],
  providers: [
    UserService,
    UserAddressService,
    UserPreferenceService,
    AddressSearchService,
    PreferenceUpdateAiService,
    AdminInitializerService,
    TestUserSeederService,
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
