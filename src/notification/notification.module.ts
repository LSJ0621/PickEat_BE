import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '@/user/user.module';
import { SchedulerAlertModule } from '@/common/services/scheduler-alert.module';
import { AdminNotificationController } from './controllers/admin-notification.controller';
import { Notification } from './entities/notification.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationSchedulerService } from './services/notification-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    UserModule,
    SchedulerAlertModule,
  ],
  controllers: [NotificationController, AdminNotificationController],
  providers: [NotificationService, NotificationSchedulerService],
  exports: [NotificationService],
})
export class NotificationModule {}
