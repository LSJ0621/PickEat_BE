export class DailySearchItem {
  date: string;
  count: number;
}

export class SearchVolumeResponseDto {
  places: DailySearchItem[];
  blogs: DailySearchItem[];
  summary: {
    totalPlaceSearches: number;
    totalBlogSearches: number;
    placeChangeRate: number; // 전기간 대비 (%)
    blogChangeRate: number;
  };
}
