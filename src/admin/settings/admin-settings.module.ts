import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/user/entities/user.entity';
import { DiscordModule } from '@/external/discord/discord.module';
import { SystemSetting } from './entities/system-setting.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemSetting, AdminAuditLog, User]),
    DiscordModule,
  ],
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService],
  exports: [AdminSettingsService],
})
export class AdminSettingsModule {}
