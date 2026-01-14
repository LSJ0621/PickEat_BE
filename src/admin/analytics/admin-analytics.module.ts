import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceSearchLog } from './entities/place-search-log.entity';
import { MenuRecommendation } from '@/menu/entities/menu-recommendation.entity';
import { MenuSelection } from '@/menu/entities/menu-selection.entity';
import { AdminRestaurantAnalyticsService } from './services/admin-restaurant-analytics.service';
import { AdminRestaurantAnalyticsController } from './controllers/admin-restaurant-analytics.controller';
import { AdminMenuAnalyticsService } from './services/admin-menu-analytics.service';
import { AdminMenuTrendService } from './services/admin-menu-trend.service';
import { AdminMenuPopularService } from './services/admin-menu-popular.service';
import { AdminMenuRegionService } from './services/admin-menu-region.service';
import { AdminMenuAnalyticsController } from './controllers/admin-menu-analytics.controller';
import { PlaceSearchLogService } from './services/place-search-log.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlaceSearchLog,
      MenuRecommendation,
      MenuSelection,
    ]),
  ],
  controllers: [
    AdminRestaurantAnalyticsController,
    AdminMenuAnalyticsController,
  ],
  providers: [
    AdminRestaurantAnalyticsService,
    AdminMenuAnalyticsService,
    AdminMenuTrendService,
    AdminMenuPopularService,
    AdminMenuRegionService,
    PlaceSearchLogService,
  ],
  exports: [TypeOrmModule, PlaceSearchLogService],
})
export class AdminAnalyticsModule {}
