import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageLog } from './entities/api-usage-log.entity';
import { EmailLog } from './entities/email-log.entity';
import { ApiUsageLogService } from './services/api-usage-log.service';
import { EmailLogService } from './services/email-log.service';
import { AdminMonitoringService } from './services/admin-monitoring.service';
import { AdminMonitoringController } from './admin-monitoring.controller';
import { AwsModule } from '@/external/aws/aws.module';

@Module({
  imports: [TypeOrmModule.forFeature([ApiUsageLog, EmailLog]), AwsModule],
  controllers: [AdminMonitoringController],
  providers: [ApiUsageLogService, EmailLogService, AdminMonitoringService],
  exports: [ApiUsageLogService, EmailLogService],
})
export class AdminMonitoringModule {}
