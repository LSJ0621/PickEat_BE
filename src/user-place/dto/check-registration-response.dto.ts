export class NearbyPlaceDto {
  id: number;
  name: string;
  address: string;
  distance: number;
}

export class CheckRegistrationResponseDto {
  canRegister: boolean;
  dailyRemaining: number;
  duplicateExists: boolean;
  nearbyPlaces: NearbyPlaceDto[];
}
