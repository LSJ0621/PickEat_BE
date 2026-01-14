import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { AdminMonitoringService } from './services/admin-monitoring.service';
import { MonitoringQueryDto } from './dto/monitoring-query.dto';
import { ApiUsageResponseDto } from './dto/api-usage-response.dto';
import { EmailStatsResponseDto } from './dto/email-stats-response.dto';
import { StorageStatsResponseDto } from './dto/storage-stats-response.dto';

@Controller('admin/monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminMonitoringController {
  constructor(private readonly monitoringService: AdminMonitoringService) {}

  @Get('api-usage')
  async getApiUsageStats(
    @Query() query: MonitoringQueryDto,
  ): Promise<ApiUsageResponseDto> {
    return this.monitoringService.getApiUsageStats(query);
  }

  @Get('email')
  async getEmailStats(
    @Query() query: MonitoringQueryDto,
  ): Promise<EmailStatsResponseDto> {
    return this.monitoringService.getEmailStats(query);
  }

  @Get('storage')
  async getStorageStats(): Promise<StorageStatsResponseDto> {
    return this.monitoringService.getStorageStats();
  }
}
