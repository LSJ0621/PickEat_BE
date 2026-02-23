import { Module } from '@nestjs/common';
import { AdminDashboardModule } from './dashboard/admin-dashboard.module';
import { AdminUserModule } from './user/admin-user.module';
import { AdminSettingsModule } from './settings/admin-settings.module';

@Module({
  imports: [AdminDashboardModule, AdminUserModule, AdminSettingsModule],
})
export class AdminModule {}
