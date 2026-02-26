import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { SchedulerAlertService } from './scheduler-alert.service';

@Module({
  imports: [HttpModule.register({ timeout: 10000 })],
  providers: [SchedulerAlertService],
  exports: [SchedulerAlertService],
})
export class SchedulerAlertModule {}
