import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { SearchService } from './search.service';
import { SearchRestaurantsDto } from './dto/search-restaurants.dto';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('restaurants')
  async searchRestaurants(@Body() dto: SearchRestaurantsDto) {
    return this.searchService.searchRestaurants(dto);
  }
}
