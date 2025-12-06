export class UserAddressResponseDto {
  id: number;
  roadAddress: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  isDefault: boolean;
  isSearchAddress: boolean;
  alias: string | null;
  createdAt: Date;
  updatedAt: Date;
}

