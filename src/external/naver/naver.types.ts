/**
 * Naver 로컬 검색 아이템
 */
export interface NaverLocalSearchItem {
  title: string;
  category?: string;
  description?: string;
  telephone?: string;
  address?: string;
  roadAddress?: string;
  link?: string;
  mapx?: string;
  mapy?: string;
  distance?: string;
}

/**
 * Naver 로컬 검색 응답
 */
export interface NaverLocalSearchResponse {
  total: number;
  display: number;
  start: number;
  items: NaverLocalSearchItem[];
}

/**
 * Naver Reverse Geocode 지역 영역
 */
export interface NaverRegionArea {
  name: string;
}

/**
 * Naver Reverse Geocode 결과
 */
export interface NaverReverseGeocodeResult {
  name: string;
  code?: {
    id: string;
    type: string;
    mappingId: string;
  };
  region?: {
    area0?: NaverRegionArea;
    area1?: NaverRegionArea;
    area2?: NaverRegionArea;
    area3?: NaverRegionArea;
    area4?: NaverRegionArea;
  };
  land?: {
    type?: string;
    number1?: string;
    number2?: string;
    addition0?: { type: string; value: string };
    addition1?: { type: string; value: string };
    addition2?: { type: string; value: string };
    name?: string;
  };
}

/**
 * Naver Reverse Geocode 응답
 */
export interface NaverReverseGeocodeResponse {
  status: {
    code: number;
    name: string;
    message: string;
  };
  results: NaverReverseGeocodeResult[];
}
