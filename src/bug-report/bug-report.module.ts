import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsModule } from '../external/aws/aws.module';
import { DiscordModule } from '../external/discord/discord.module';
import { UserModule } from '../user/user.module';
import { BugReport } from './entities/bug-report.entity';
import { BugReportController } from './bug-report.controller';
import { BugReportService } from './bug-report.service';
import { AdminBugReportController } from './controllers/admin-bug-report.controller';
import { BugReportSchedulerService } from './services/bug-report-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BugReport]),
    UserModule,
    AwsModule,
    DiscordModule,
  ],
  controllers: [BugReportController, AdminBugReportController],
  providers: [BugReportService, BugReportSchedulerService],
  exports: [BugReportService, TypeOrmModule],
})
export class BugReportModule {}


