import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddressSearchResult {
  @IsString()
  @IsNotEmpty()
  address: string; // 지번주소 (address.address_name)

  @IsString()
  @IsOptional()
  roadAddress: string | null; // 도로명 주소 (road_address.address_name)

  @IsString()
  @IsOptional()
  postalCode: string | null; // 우편번호 (road_address.zone_no)

  @IsString()
  @IsNotEmpty()
  latitude: string; // 위도 (y)

  @IsString()
  @IsNotEmpty()
  longitude: string; // 경도 (x)
}
