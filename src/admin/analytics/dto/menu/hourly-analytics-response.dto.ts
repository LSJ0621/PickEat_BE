export class HourlyCountItem {
  hour: number; // 0-23
  count: number;
}

export class DayHourCountItem {
  day: number; // 0-6 (일-토)
  hour: number; // 0-23
  count: number;
}

export class HourlyAnalyticsResponseDto {
  byHour: HourlyCountItem[];
  byDayAndHour: DayHourCountItem[];
  peakTime: {
    hour: number;
    count: number;
  };
}
