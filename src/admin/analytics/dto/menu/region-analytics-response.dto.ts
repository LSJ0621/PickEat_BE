export class RegionItem {
  region: string; // 시/도명
  count: number;
  percentage: number;
}

export class RegionAnalyticsResponseDto {
  byRegion: RegionItem[];
}

export class RegionPopularMenuItem {
  menu: string;
  count: number;
  nationalRank: number; // 전국 순위
  isUnique: boolean; // 해당 지역 특화 메뉴 여부
}

export class RegionPopularMenuResponseDto {
  region: string;
  data: RegionPopularMenuItem[];
}
