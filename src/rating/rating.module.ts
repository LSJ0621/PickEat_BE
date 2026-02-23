import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '@/user/user.module';
import { PlaceRating } from './entities/place-rating.entity';
import { UserPlace } from '@/user-place/entities/user-place.entity';
import { RatingService } from './rating.service';
import { RatingSchedulerService } from './rating-scheduler.service';
import { RatingController } from './rating.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlaceRating, UserPlace]), UserModule],
  controllers: [RatingController],
  providers: [RatingService, RatingSchedulerService],
  exports: [RatingService],
})
export class RatingModule {}
