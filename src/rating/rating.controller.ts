import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthUserPayload,
  CurrentUser,
} from '@/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/auth/guard/jwt.guard';
import { UserService } from '@/user/user.service';
import { RatingService } from './rating.service';
import { SelectPlaceDto } from './dto/select-place.dto';
import { SubmitRatingDto } from './dto/submit-rating.dto';
import { SkipRatingDto } from './dto/skip-rating.dto';
import { DismissRatingDto } from './dto/dismiss-rating.dto';
import { GetRatingHistoryDto } from './dto/get-rating-history.dto';

@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingController {
  constructor(
    private readonly ratingService: RatingService,
    private readonly userService: UserService,
  ) {}

  @Post('select')
  async selectPlace(
    @Body() dto: SelectPlaceDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    return this.ratingService.selectPlace(user, dto);
  }

  @Get('pending')
  async getPendingRating(@CurrentUser() authUser: AuthUserPayload) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    return this.ratingService.getPendingRating(user);
  }

  @Post('submit')
  async submitRating(
    @Body() dto: SubmitRatingDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    await this.ratingService.submitRating(user, dto);
    return { success: true };
  }

  @Post('skip')
  async skipRating(
    @Body() dto: SkipRatingDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    await this.ratingService.skipRating(user, dto);
    return { success: true };
  }

  @Post('dismiss')
  async dismissRating(
    @Body() dto: DismissRatingDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    await this.ratingService.dismissRating(user, dto);
    return { success: true };
  }

  @Get('history')
  async getRatingHistory(
    @Query() dto: GetRatingHistoryDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getAuthenticatedEntity(authUser.email);
    return this.ratingService.getRatingHistory(user, dto);
  }
}
