import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminUserController } from './user/admin-user.controller';
import { AdminUserService } from './user/admin-user.service';
import { AdminSettingsModule } from './settings/admin-settings.module';
import { UserModule } from '@/user/user.module';
import { User } from '@/user/entities/user.entity';
import { UserAddress } from '@/user/entities/user-address.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { AdminAuditLog } from './settings/entities/admin-audit-log.entity';

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
    AdminSettingsModule,
    UserModule,
  ],
  controllers: [AdminDashboardController, AdminUserController],
  providers: [AdminDashboardService, AdminUserService],
})
export class AdminModule {}
