import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsModule } from '../external/aws/aws.module';
import { DiscordModule } from '../external/discord/discord.module';
import { UserModule } from '../user/user.module';
import { BugReport } from './entities/bug-report.entity';
import { BugReportAdminNote } from './entities/bug-report-admin-note.entity';
import { BugReportNotification } from './entities/bug-report-notification.entity';
import { BugReportStatusHistory } from './entities/bug-report-status-history.entity';
import { BugReportController } from './bug-report.controller';
import { BugReportService } from './bug-report.service';
import { AdminBugReportController } from './controllers/admin-bug-report.controller';
import { BugReportSchedulerService } from './services/bug-report-scheduler.service';
import { BugReportNotificationService } from './services/bug-report-notification.service';
import { DiscordMessageBuilderService } from './services/discord-message-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BugReport,
      BugReportAdminNote,
      BugReportNotification,
      BugReportStatusHistory,
    ]),
    UserModule,
    AwsModule,
    DiscordModule,
  ],
  controllers: [BugReportController, AdminBugReportController],
  providers: [
    BugReportService,
    BugReportSchedulerService,
    BugReportNotificationService,
    DiscordMessageBuilderService,
  ],
  exports: [BugReportService, TypeOrmModule],
})
export class BugReportModule {}
