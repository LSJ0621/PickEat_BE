import { UserPlace } from '../entities/user-place.entity';

export interface UserPlaceListResult {
  items: UserPlace[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
