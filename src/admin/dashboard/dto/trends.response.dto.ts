export class TrendsResponseDto {
  users: Array<{ date: string; count: number }>;
  recommendations: Array<{ date: string; count: number }>;
}
