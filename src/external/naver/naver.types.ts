/**
 * Naver Local Search response item
 */
export interface NaverLocalSearchItem {
  title?: string;
  link?: string;
  category?: string;
  description?: string;
  telephone?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string;
  mapy?: string;
  distance?: string;
}

/**
 * Naver Local Search API response
 */
export interface NaverLocalSearchResponse {
  total?: number;
  display?: number;
  start?: number;
  items?: NaverLocalSearchItem[];
}

/**
 * Naver Reverse Geocode result region area
 */
export interface NaverRegionArea {
  name?: string;
}

/**
 * Naver Reverse Geocode result land information
 */
export interface NaverLandInfo {
  type?: string;
  name?: string;
  number1?: string;
  number2?: string;
  addition0?: { type?: string; value?: string };
  addition1?: { type?: string; value?: string };
  addition2?: { type?: string; value?: string };
}

/**
 * Naver Reverse Geocode result
 */
export interface NaverReverseGeocodeResult {
  name?: string;
  code?: {
    id?: string;
    type?: string;
    mappingId?: string;
  };
  region?: {
    area0?: NaverRegionArea;
    area1?: NaverRegionArea;
    area2?: NaverRegionArea;
    area3?: NaverRegionArea;
    area4?: NaverRegionArea;
  };
  land?: NaverLandInfo;
}

/**
 * Naver Reverse Geocode API response
 */
export interface NaverReverseGeocodeResponse {
  status?: {
    code?: number;
    name?: string;
    message?: string;
  };
  results?: NaverReverseGeocodeResult[];
}
