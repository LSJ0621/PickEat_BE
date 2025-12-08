import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { GooglePlacesClient } from '../external/google/clients/google-places.client';
import { NaverMapClient } from '../external/naver/clients/naver-map.client';
import { NaverReverseGeocodeResult } from '../external/naver/naver.types';
import { SearchRestaurantsDto } from '../search/dto/search-restaurants.dto';
import { RestaurantSummary } from '../search/interfaces/search.interface';
import { SearchService } from '../search/search.service';
import { MapMarker, MapRestaurantsResponse } from './interfaces/map.interface';

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);

  constructor(
    @Inject(forwardRef(() => SearchService))
    private readonly searchService: SearchService,
    private readonly naverMapClient: NaverMapClient,
    private readonly googlePlacesClient: GooglePlacesClient,
  ) {}

  async getRestaurantMarkers(
    dto: SearchRestaurantsDto,
  ): Promise<MapRestaurantsResponse> {
    const { restaurants } = await this.searchService.searchRestaurants(dto);
    return {
      markers: restaurants.map((restaurant) => this.toMarker(restaurant)),
    };
  }

  async reverseGeocode(
    latitude: number,
    longitude: number,
    includeRoadAddress: boolean = false,
  ): Promise<string | null> {
    this.logger.log(`🔍 [역지오코딩 요청] lat=${latitude}, lng=${longitude}`);

    try {
      const results = await this.naverMapClient.reverseGeocode(
        latitude,
        longitude,
        { includeRoadAddress },
      );

      const address = this.extractAddressFromResults(results, includeRoadAddress);

      if (address) {
        this.logger.log(`✅ [역지오코딩 응답] address="${address}"`);
      }

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `❌ [역지오코딩 에러] lat=${latitude}, lng=${longitude}, error=${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  private extractAddressFromResults(
    results: NaverReverseGeocodeResult[],
    includeRoadAddress: boolean,
  ): string | null {
    if (!results?.length) {
      return null;
    }

    const preferredOrder = ['roadaddr', 'addr', 'admcode', 'legalcode'];

    for (const name of preferredOrder) {
      const candidate = results.find((result) => result.name === name);
      if (!candidate) continue;

      const address = this.buildDetailedAddress(candidate, includeRoadAddress);
      if (address) {
        return address;
      }
    }

    for (const result of results) {
      const address = this.buildDetailedAddress(result, includeRoadAddress);
      if (address) {
        return address;
      }
    }

    return null;
  }

  private buildDetailedAddress(
    result: NaverReverseGeocodeResult,
    includeRoadAddress: boolean,
  ): string | null {
    if (!result.region) {
      return null;
    }

    const regionAddress = this.buildRegionAddress(result.region);
    if (!regionAddress) {
      return null;
    }

    if (includeRoadAddress && result.name === 'roadaddr' && result.land) {
      const roadParts: string[] = [];

      if (result.land.name && typeof result.land.name === 'string') {
        roadParts.push(result.land.name);
      }

      if (result.land.number1 && typeof result.land.number1 === 'string') {
        roadParts.push(result.land.number1);
        if (result.land.number2 && typeof result.land.number2 === 'string') {
          roadParts.push(result.land.number2);
        }
      }

      if (roadParts.length > 0) {
        return `${regionAddress} ${roadParts.join(' ')}`;
      }
    }

    return regionAddress;
  }

  private buildRegionAddress(
    region?: NaverReverseGeocodeResult['region'],
  ): string | null {
    if (!region) {
      return null;
    }

    const names: string[] = [];

    if (region.area1?.name?.trim()) names.push(region.area1.name.trim());
    if (region.area2?.name?.trim()) names.push(region.area2.name.trim());
    if (region.area3?.name?.trim()) names.push(region.area3.name.trim());
    if (region.area4?.name?.trim()) names.push(region.area4.name.trim());

    if (!names.length && region.area0?.name?.trim()) {
      names.push(region.area0.name.trim());
    }

    const uniqueNames = names.filter(
      (name, index) => names.indexOf(name) === index,
    );

    return uniqueNames.length ? uniqueNames.join(' ') : null;
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

  async getGooglePlacePhoto(
    photoName: string,
    maxHeightPx: number = 400,
    maxWidthPx: number = 400,
  ) {
    this.logger.log(`🔍 [Google Places 사진 요청] name="${photoName}"`);

    const photoUri = await this.googlePlacesClient.getPhotoUri(photoName, {
      maxHeight: maxHeightPx,
      maxWidth: maxWidthPx,
    });

    this.logger.log(`✅ [Google Places 사진 응답] uri=${photoUri}`);
    return { photoUri };
  }
}
