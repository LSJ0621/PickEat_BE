import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwsModule } from '@/external/aws/aws.module';
import { DiscordModule } from '@/external/discord/discord.module';
import { UserModule } from '@/user/user.module';
import { BugReport } from './entities/bug-report.entity';
import { BugReportStatusHistory } from './entities/bug-report-status-history.entity';
import { BugReportController } from './bug-report.controller';
import { BugReportService } from './bug-report.service';
import { AdminBugReportController } from './controllers/admin-bug-report.controller';
import { DiscordMessageBuilderService } from './services/discord-message-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BugReport, BugReportStatusHistory]),
    UserModule,
    AwsModule,
    DiscordModule,
  ],
  controllers: [BugReportController, AdminBugReportController],
  providers: [BugReportService, DiscordMessageBuilderService],
  exports: [BugReportService, TypeOrmModule],
})
export class BugReportModule {}
