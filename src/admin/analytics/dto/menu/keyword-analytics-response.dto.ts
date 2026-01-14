export class KeywordItem {
  keyword: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
  changeRate: number; // 변화율 (%)
}

export class KeywordAnalyticsResponseDto {
  data: KeywordItem[];
}
