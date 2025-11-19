export interface MapMarker {
  name: string;
  address: string;
  roadAddress?: string;
  phone?: string;
  mapx?: number;
  mapy?: number;
  distance?: number;
  link?: string;
}

export interface MapRestaurantsResponse {
  markers: MapMarker[];
}
