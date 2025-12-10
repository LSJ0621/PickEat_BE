import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { SearchRestaurantsDto } from '../search/dto/search-restaurants.dto';
import { MapService } from './map.service';

@Controller('map')
@UseGuards(JwtAuthGuard)
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Post('restaurants')
  async getRestaurantMarkers(@Body() dto: SearchRestaurantsDto) {
    return this.mapService.getRestaurantMarkers(dto);
  }
}
