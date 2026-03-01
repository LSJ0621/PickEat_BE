import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { AdminAuditLog } from '@/admin/settings/entities/admin-audit-log.entity';
import { UserModule } from '@/user/user.module';
import { RedisCacheModule } from '@/common/cache/cache.module';
import { AdminUserController } from './admin-user.controller';
import { AdminUserService } from './admin-user.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserAddress,
      MenuRecommendation,
      MenuSelection,
      BugReport,
      AdminAuditLog,
    ]),
    UserModule,
    RedisCacheModule,
  ],
  controllers: [AdminUserController],
  providers: [AdminUserService],
  exports: [AdminUserService],
})
export class AdminUserModule {}
