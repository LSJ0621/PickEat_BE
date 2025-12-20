import { Injectable } from '@nestjs/common';
import { SearchRestaurantsDto } from '@/search/dto/search-restaurants.dto';
import { RestaurantSummary } from '@/search/interfaces/search.interface';
import { SearchService } from '@/search/search.service';
import {
  MapMarker,
  MapRestaurantsResponse,
} from '@/map/interfaces/map.interface';

@Injectable()
export class MapService {
  constructor(private readonly searchService: SearchService) {}

  async getRestaurantMarkers(
    dto: SearchRestaurantsDto,
  ): Promise<MapRestaurantsResponse> {
    const { restaurants } = await this.searchService.searchRestaurants(dto);
    return {
      markers: restaurants.map((restaurant) => this.toMarker(restaurant)),
    };
  }

  private toMarker(restaurant: RestaurantSummary): MapMarker {
    return {
      name: restaurant.name,
      address: restaurant.address,
      roadAddress: restaurant.roadAddress,
      phone: restaurant.phone,
      mapx: restaurant.mapx,
      mapy: restaurant.mapy,
      distance: restaurant.distance,
      link: restaurant.link,
    };
  }
}
