export class AddressSearchResult {
  address: string; // 지번주소 (address.address_name)
  roadAddress: string | null; // 도로명 주소 (road_address.address_name)
  postalCode: string | null; // 우편번호 (road_address.zone_no)
  latitude: string; // 위도 (y)
  longitude: string; // 경도 (x)
}

export interface AddressSearchResponse {
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
  addresses: AddressSearchResult[];
}

