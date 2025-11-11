import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { MapService } from './map.service';
import { SearchRestaurantsDto } from '../search/dto/search-restaurants.dto';

@Controller('map')
@UseGuards(JwtAuthGuard)
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Post('restaurants')
  async getRestaurantMarkers(@Body() dto: SearchRestaurantsDto) {
    return this.mapService.getRestaurantMarkers(dto);
  }
}
