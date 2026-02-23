import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/user/entities/user.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { BugReport } from '@/bug-report/entities/bug-report.entity';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, MenuRecommendation, BugReport])],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
  exports: [AdminDashboardService],
})
export class AdminDashboardModule {}
