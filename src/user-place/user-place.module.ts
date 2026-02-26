import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '@/user/user.module';
import { AwsModule } from '@/external/aws/aws.module';
import { AdminAuditLog } from '@/admin/settings/entities/admin-audit-log.entity';
import { UserPlace } from './entities/user-place.entity';
import { UserPlaceRejectionHistory } from './entities/user-place-rejection-history.entity';
import { UserPlaceService } from './user-place.service';
import { AdminUserPlaceService } from './services/admin-user-place.service';
import { AdminUserPlaceStatsService } from './services/admin-user-place-stats.service';
import { UserPlaceController } from './user-place.controller';
import { AdminUserPlaceController } from './controllers/admin-user-place.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserPlace,
      UserPlaceRejectionHistory,
      AdminAuditLog,
    ]),
    UserModule,
    AwsModule,
  ],
  controllers: [UserPlaceController, AdminUserPlaceController],
  providers: [
    UserPlaceService,
    AdminUserPlaceService,
    AdminUserPlaceStatsService,
  ],
  exports: [UserPlaceService],
})
export class UserPlaceModule {}
