import { Injectable, Logger } from '@nestjs/common';
import { KakaoLocalClient } from '../../external/kakao/clients/kakao-local.client';
import { SearchAddressDto } from '../dto/search-address.dto';
import { AddressSearchResponse } from '../interfaces/address-search-result.interface';

@Injectable()
export class AddressSearchService {
  private readonly logger = new Logger(AddressSearchService.name);

  constructor(private readonly kakaoLocalClient: KakaoLocalClient) {}

  async searchAddress(searchDto: SearchAddressDto): Promise<AddressSearchResponse> {
    this.logger.debug(`주소 검색 요청: ${searchDto.query}`);
    const result = await this.kakaoLocalClient.searchAddress(searchDto.query);

    return {
      meta: result.meta,
      addresses: result.addresses,
    };
  }
}

