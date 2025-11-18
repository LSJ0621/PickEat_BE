import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthUserPayload,
  CurrentUser,
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
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      return this.menuService.recommendForUser(
        result.user!,
        recommendMenuDto.prompt,
      );
    } else {
      return this.menuService.recommendForSocialLogin(
        result.socialLogin!,
        recommendMenuDto.prompt,
      );
    }
  }

  @Get('recommendations/history')
  async getHistory(
    @Query() query: RecommendationHistoryQueryDto,
    @CurrentUser() authUser: AuthUserPayload,
  ) {
    const result = await this.userService.findUserOrSocialLoginByEmail(
      authUser.email,
    );
    if (result.type === 'user') {
      return this.menuService.getHistory(result.user!, query.date);
    } else {
      return this.menuService.getHistoryForSocialLogin(
        result.socialLogin!,
        query.date,
      );
    }
  }
}
