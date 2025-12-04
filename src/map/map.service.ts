import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { SearchRestaurantsDto } from '../search/dto/search-restaurants.dto';
import { RestaurantSummary, SearchService } from '../search/search.service';
import { MapMarker, MapRestaurantsResponse } from './interfaces/map.interface';
import {
  NaverReverseGeocodeResponse,
  NaverReverseGeocodeResult,
} from './interfaces/naver-reverse-geocode.interface';

const NAVER_MAP_REVERSE_GEOCODE_URL =
  'https://maps.apigw.ntruss.com/map-reversegeocode/v2/gc';
const GOOGLE_PLACES_API_URL =
  'https://places.googleapis.com/v1/places:searchText';

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);
  private readonly naverMapClientId: string;
  private readonly naverMapClientSecret: string;
  private readonly googleApiKey: string;

  constructor(
    @Inject(forwardRef(() => SearchService))
    private readonly searchService: SearchService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    // .env.development 기준:
    // NAVER_MAP_CLIENT_ID, NAVER_MAP_CLIENT_SECRET, GOOGLE_API_KEY
    this.naverMapClientId = this.config.get<string>(
      'NAVER_MAP_CLIENT_ID',
      '',
    );
    this.naverMapClientSecret = this.config.get<string>(
      'NAVER_MAP_CLIENT_SECRET',
      '',
    );
    this.googleApiKey = this.config.get<string>('GOOGLE_API_KEY', '');
  }

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
    const hasCredentials =
      this.naverMapClientId &&
      this.naverMapClientSecret &&
      !this.naverMapClientId.includes('<<PUT_YOUR') &&
      !this.naverMapClientSecret.includes('<<PUT_YOUR');

    if (!hasCredentials) {
      return null;
    }

    this.logger.log(`🔍 [역지오코딩 요청] lat=${latitude}, lng=${longitude}`);

    try {
      const response = await lastValueFrom(
        this.httpService.get<NaverReverseGeocodeResponse>(
          NAVER_MAP_REVERSE_GEOCODE_URL,
          {
            headers: {
              'X-NCP-APIGW-API-KEY-ID': this.naverMapClientId,
              'X-NCP-APIGW-API-KEY': this.naverMapClientSecret,
            },
            params: {
              coords: `${longitude},${latitude}`,
              output: 'json',
              orders: 'legalcode,admcode,addr,roadaddr',
            },
          },
        ),
      );

      const address = this.extractAddressFromGeocode(
        response.data,
        includeRoadAddress,
      );

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

  private extractAddressFromGeocode(
    response: NaverReverseGeocodeResponse,
    includeRoadAddress: boolean,
  ): string | null {
    if (!response?.results?.length) {
      return null;
    }

    const preferredOrder = ['roadaddr', 'addr', 'admcode', 'legalcode'];

    for (const name of preferredOrder) {
      const candidate = response.results.find((result) => result.name === name);
      if (!candidate) continue;

      const address = this.buildDetailedAddress(candidate, includeRoadAddress);
      if (address) {
        return address;
      }
    }

    for (const result of response.results) {
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

    // 기본 지역 주소 구성 (area1 ~ area4)
    const regionAddress = this.buildRegionAddress(result.region);
    if (!regionAddress) {
      return null;
    }

    // includeRoadAddress가 true이고 roadaddr 타입인 경우에만 도로명 주소 추가
    if (includeRoadAddress && result.name === 'roadaddr' && result.land) {
      const roadParts: string[] = [];

      // land.name이 도로명
      if (result.land.name && typeof result.land.name === 'string') {
        roadParts.push(result.land.name);
      }

      // land.number1, number2가 건물번호
      if (result.land.number1 && typeof result.land.number1 === 'string') {
        roadParts.push(result.land.number1);
        if (result.land.number2 && typeof result.land.number2 === 'string') {
          roadParts.push(result.land.number2);
        }
      }

      // 도로명이 있으면 추가
      if (roadParts.length > 0) {
        return `${regionAddress} ${roadParts.join(' ')}`;
      }
    }

    // includeRoadAddress가 false이거나 도로명이 없으면 기본 지역 주소만 반환
    return regionAddress;
  }

  private buildRegionAddress(
    region?: NaverReverseGeocodeResult['region'],
  ): string | null {
    if (!region) {
      return null;
    }

    const areaKeys: Array<keyof NaverReverseGeocodeResult['region']> = [
      'area1',
      'area2',
      'area3',
      'area4',
    ];

    const names = areaKeys
      .map((key) => region[key]?.name?.trim())
      .filter((value): value is string => Boolean(value));

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
    if (!this.googleApiKey) {
      throw new Error('this.googleApiKey가 설정되지 않았습니다.');
    }

    this.logger.log(`🔍 [Google Places 사진 요청] name="${photoName}"`);

    try {
      const url = `https://places.googleapis.com/v1/${photoName}/media`;
      const response = await lastValueFrom(
        this.httpService.get(url, {
          params: {
            key: this.googleApiKey,
            maxHeightPx,
            maxWidthPx,
            skipHttpRedirect: true,
          },
          headers: {
            Referer: 'http://localhost:3000',
          },
        }),
      );

      const photoUri = response.data?.photoUri;
      this.logger.log(`✅ [Google Places 사진 응답] uri=${photoUri}`);
      return { photoUri };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const statusCode = error?.response?.status;
      const errorData = error?.response?.data;
      this.logger.error(
        `❌ [Google Places 사진 에러] name="${photoName}", status=${statusCode}, error=${message}`,
      );
      if (errorData) {
        this.logger.error(`에러 상세: ${JSON.stringify(errorData)}`);
      }
      throw error;
    }
  }
}
