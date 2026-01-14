export class SlotTrendItem {
  date: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  etc: number;
}

export class SlotAnalyticsResponseDto {
  data: {
    breakfast: number;
    lunch: number;
    dinner: number;
    etc: number;
  };
  trends: SlotTrendItem[];
}
