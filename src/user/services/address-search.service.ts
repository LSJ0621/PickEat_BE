import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GooglePlacesClient } from '../../external/google/clients/google-places.client';
import { KakaoLocalClient } from '../../external/kakao/clients/kakao-local.client';
import { SearchAddressDto } from '../dto/search-address.dto';
import {
  AddressSearchResponse,
  AddressSearchResult,
} from '../interfaces/address-search-result.interface';

@Injectable()
export class AddressSearchService {
  private readonly logger = new Logger(AddressSearchService.name);
  private readonly provider: 'kakao' | 'google';

  constructor(
    private readonly kakaoLocalClient: KakaoLocalClient,
    private readonly googlePlacesClient: GooglePlacesClient,
    private readonly configService: ConfigService,
  ) {
    const providerConfig =
      this.configService.get<string>('ADDRESS_SEARCH_PROVIDER') || 'kakao';
    if (providerConfig !== 'kakao' && providerConfig !== 'google') {
      this.logger.warn(
        `Invalid provider "${providerConfig}", defaulting to kakao`,
      );
      this.provider = 'kakao';
    } else {
      this.provider = providerConfig;
    }
    this.logger.log(`주소 검색 제공자: ${this.provider}`);
  }

  async searchAddress(
    searchDto: SearchAddressDto,
  ): Promise<AddressSearchResponse> {
    this.logger.debug(`주소 검색 요청: ${searchDto.query}`);

    const language = searchDto.language ?? 'ko';

    if (this.provider === 'google') {
      return this.searchWithGoogle(searchDto.query, language);
    }

    return this.searchWithKakao(searchDto.query);
  }

  private async searchWithKakao(query: string): Promise<AddressSearchResponse> {
    const result = await this.kakaoLocalClient.searchAddress(query);
    return {
      meta: result.meta,
      addresses: result.addresses,
    };
  }

  private async searchWithGoogle(
    query: string,
    language: 'ko' | 'en',
  ): Promise<AddressSearchResponse> {
    // 1. 세션 토큰 생성
    const sessionToken = this.googlePlacesClient.createSessionToken();
    const sessionTokenPreview = sessionToken.substring(0, 8);
    this.logger.log(
      `[Google 주소 검색] 세션 토큰 생성: ${sessionTokenPreview}...`,
    );

    // 2. Autocomplete 호출
    this.logger.log(
      `[Google 주소 검색] Autocomplete 호출 (토큰: ${sessionTokenPreview}...)`,
    );
    const suggestions = await this.googlePlacesClient.autocomplete(query, {
      sessionToken,
      languageCode: language,
    });

    // 유효한 예측 결과 필터링
    const predictions = suggestions.filter((s) => s.placePrediction);

    if (predictions.length === 0) {
      return {
        meta: { total_count: 0, pageable_count: 0, is_end: true },
        addresses: [],
      };
    }

    // 3. 각 장소의 상세 정보 조회 (좌표 획득) - Promise.allSettled로 부분 실패 허용
    this.logger.log(
      `[Google 주소 검색] Details 호출 ${predictions.length}건 (동일 토큰 사용)`,
    );
    const detailsResults = await Promise.allSettled(
      predictions.map(async (s) => {
        const prediction = s.placePrediction!;
        const details = await this.googlePlacesClient.getDetails(
          prediction.placeId,
          {
            useMinimalFields: true,
            sessionToken,
            languageCode: language,
          },
        );

        return this.mapToAddressResult(details, prediction);
      }),
    );

    // 성공한 결과만 추출 후 null 필터링
    const validAddresses = detailsResults
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<AddressSearchResult | null> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value)
      .filter((a): a is AddressSearchResult => a !== null);

    this.logger.log(
      `[Google 주소 검색] 완료: ${validAddresses.length}건 반환 (세션당 청구)`,
    );

    return {
      meta: {
        total_count: validAddresses.length,
        pageable_count: validAddresses.length,
        is_end: true,
      },
      addresses: validAddresses,
    };
  }

  private mapToAddressResult(
    details: {
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    } | null,
    prediction: {
      text: { text: string };
      structuredFormat?: {
        mainText: { text: string };
        secondaryText?: { text: string };
      };
    },
  ): AddressSearchResult | null {
    if (!details || !details.location) {
      return null;
    }

    const address = details.formattedAddress ?? prediction.text.text;

    return {
      address,
      roadAddress: address, // Google은 지번/도로명 구분 없음
      postalCode: null, // Google Places API는 우편번호 미제공
      latitude: String(details.location.latitude),
      longitude: String(details.location.longitude),
    };
  }
}
