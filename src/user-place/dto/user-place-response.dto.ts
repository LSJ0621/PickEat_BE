import { UserPlaceStatus } from '../enum/user-place-status.enum';
import {
  MenuItem,
  BusinessHours,
} from '../interfaces/business-hours.interface';

export class UserPlaceResponseDto {
  id: number;
  userId: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  menuItems: MenuItem[];
  photos: string[] | null;
  businessHours: BusinessHours | null;
  phoneNumber: string | null;
  category: string | null;
  description: string | null;
  status: UserPlaceStatus;
  rejectionReason: string | null;
  rejectionCount: number;
  lastRejectedAt: Date | null;
  lastSubmittedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
