export class DailyTrendItem {
  date: string;
  count: number;
}

export class MenuTrendsResponseDto {
  data: DailyTrendItem[];
  summary: {
    total: number;
    average: number;
    change: number; // 이전 기간 대비 증감률 (%)
  };
}
