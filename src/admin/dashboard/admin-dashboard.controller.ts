import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { RolesGuard } from '@/auth/guard/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '@/common/constants/roles.constants';
import { AdminDashboardService } from './admin-dashboard.service';
import { TrendsQueryDto } from './dto/trends-query.dto';
import { DashboardSummaryResponseDto } from './dto/dashboard-summary.response.dto';
import { RecentActivitiesResponseDto } from './dto/recent-activities.response.dto';
import { TrendsResponseDto } from './dto/trends.response.dto';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ROLES)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('summary')
  async getSummary(): Promise<DashboardSummaryResponseDto> {
    return this.dashboardService.getSummary();
  }

  @Get('recent-activities')
  async getRecentActivities(): Promise<RecentActivitiesResponseDto> {
    return this.dashboardService.getRecentActivities();
  }

  @Get('trends')
  async getTrends(@Query() query: TrendsQueryDto): Promise<TrendsResponseDto> {
    return this.dashboardService.getTrends(query);
  }
}
