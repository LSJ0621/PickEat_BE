import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  AuthUserPayload,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { UserService } from '../user/user.service';
import { RecommendMenuDto } from './dto/recommend-menu.dto';
import { RecommendationHistoryQueryDto } from './dto/recommendation-history-query.dto';
import { MenuService } from './menu.service';

@Controller('menu')
@UseGuards(JwtAuthGuard)
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly userService: UserService,
  ) {}

  @Post('recommend')
  async recommend(
    @Body() recommendMenuDto: RecommendMenuDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getOrFailByEmail(authUser.email);
    return this.menuService.recommendForUser(user, recommendMenuDto.prompt);
  }

  @Get('recommendations/history')
  async getHistory(
    @Query() query: RecommendationHistoryQueryDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const user = await this.userService.getOrFailByEmail(authUser.email);
    return this.menuService.getHistory(user, query.date);
  }
}
