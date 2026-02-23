export interface RatingHistoryItem {
  id: number;
  placeId: string;
  placeName: string;
  rating: number | null;
  skipped: boolean;
  promptDismissed: boolean;
  createdAt: string;
}

export interface RatingHistoryResponse {
  items: RatingHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
