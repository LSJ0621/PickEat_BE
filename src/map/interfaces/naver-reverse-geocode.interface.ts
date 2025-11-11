export interface NaverRegionArea {
  name?: string;
  coords?: Record<string, unknown>;
}

export interface NaverReverseGeocodeResult {
  name: string;
  code?: {
    id?: string;
    type?: string;
    mappingId?: string;
  };
  region: {
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
    name?: string; // roadaddr 타입에서 도로명이 여기 있음
    [key: string]: unknown;
  };
}

export interface NaverReverseGeocodeResponse {
  status: {
    code: number;
    name: string;
    message: string;
  };
  results: NaverReverseGeocodeResult[];
}

