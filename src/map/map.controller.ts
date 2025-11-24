import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt.guard';
import { SearchRestaurantsDto } from '../search/dto/search-restaurants.dto';
import { MapService } from './map.service';

@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Post('restaurants')
  @UseGuards(JwtAuthGuard)
  async getRestaurantMarkers(@Body() dto: SearchRestaurantsDto) {
    return this.mapService.getRestaurantMarkers(dto);
  }

  @Get('google-places/photo')
  async getGooglePlacePhoto(
    @Query('photoName') photoName: string,
    @Query('maxHeightPx') maxHeightPx?: number,
    @Query('maxWidthPx') maxWidthPx?: number,
  ) {
    return this.mapService.getGooglePlacePhoto(photoName, maxHeightPx, maxWidthPx);
  }
}
