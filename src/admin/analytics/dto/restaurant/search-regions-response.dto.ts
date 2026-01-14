export class SearchRegionItem {
  region: string; // 시/도명
  count: number;
  percentage: number;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export class SearchRegionsResponseDto {
  data: SearchRegionItem[];
}
