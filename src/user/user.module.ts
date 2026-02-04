import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleModule } from '@/external/google/google.module';
import { KakaoModule } from '@/external/kakao/kakao.module';
import { AdminInitializerService } from './services/admin-initializer.service';
import { TestUserSeederService } from './services/test-user-seeder.service';
import { UserAddress } from './entities/user-address.entity';
import { User } from './entities/user.entity';
import { UserTasteAnalysis } from './entities/user-taste-analysis.entity';
import { AddressSearchService } from './services/address-search.service';
import { UserAddressService } from './services/user-address.service';
import { UserPreferenceService } from './services/user-preference.service';
import { UserTasteAnalysisService } from './services/user-taste-analysis.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserAddress, UserTasteAnalysis]),
    GoogleModule,
    KakaoModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    UserAddressService,
    UserPreferenceService,
    UserTasteAnalysisService,
    AddressSearchService,
    AdminInitializerService,
    TestUserSeederService,
  ],
  exports: [
    UserService,
    UserAddressService,
    UserPreferenceService,
    UserTasteAnalysisService,
    TypeOrmModule,
  ],
})
export class UserModule {}
