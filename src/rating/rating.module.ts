import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '@/user/user.module';
import { SchedulerAlertModule } from '@/common/services/scheduler-alert.module';
import { PlaceRating } from './entities/place-rating.entity';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { RatingService } from './rating.service';
import { RatingSchedulerService } from './services/rating-scheduler.service';
import { RatingController } from './rating.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlaceRating, UserPlace]),
    UserModule,
    SchedulerAlertModule,
  ],
  controllers: [RatingController],
  providers: [RatingService, RatingSchedulerService],
  exports: [RatingService],
})
export class RatingModule {}
